/* eslint-disable security/detect-non-literal-fs-filename */
/* eslint-disable security/detect-non-literal-regexp */
/* eslint-disable security/detect-non-literal-require */
/* eslint-disable security-node/detect-crlf */
/* eslint-disable security-node/detect-non-literal-require-calls */
/* eslint-disable security-node/non-literal-reg-expr */
'use strict';

/**
 * Module dependencies, required for ALL Twy'r modules
 * @ignore
 */

/**
 * Module dependencies, required for this module
 * @ignore
 */
const debugLib = require('debug');
const debug = debugLib('announce:prepare');

/**
 * @class		PrepareCommandClass
 * @classdesc	The command class that handles all the prepare operations.
 *
 * @param		{object} configuration - The configuration object containing the command options from the config file (.announcerc, package.json, etc.)
 *
 * @description
 * The command class that implements the "prepare" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class PrepareCommandClass {
	// #region Constructor
	constructor(configuration) {
		Object.defineProperty(this, '_commandOptions', {
			'writeable': true,
			'value': configuration ?? {}
		});
	}
	// #endregion

	// #region Public Methods
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof PrepareCommandClass
	 * @name     execute
	 *
	 * @param    {object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  The main method to prepare the codebase for the next release.
	 *
	 * This method does 2 things:
	 * - Generates the next version string based on the current one, the option passed in, and the pre-defined version ladder
	 * - Parses the source files for the current version string, and replaces it with the next one
	 *
	 */
	async execute(options) {
		const path = require('path');
		const safeJsonStringify = require('safe-json-stringify');
		const semver = require('semver');

		// Setup sane defaults for the options
		const mergedOptions = options ?? {};
		mergedOptions.execMode = this?._commandOptions?.execMode ?? 'cli';

		mergedOptions.debug = options?.debug ?? (options?.parent?.debug ?? false);
		mergedOptions.silent = options?.silent ?? (options?.parent?.silent ?? false);
		mergedOptions.quiet = options?.quiet ?? (options?.parent?.quiet ?? false);

		mergedOptions.quiet = mergedOptions.quiet || mergedOptions.silent;

		mergedOptions.series = options?.series ?? (this?._commandOptions?.series ?? 'current');
		mergedOptions.versionLadder = options?.versionLadder ?? (this?._commandOptions?.versionLadder ?? 'dev, alpha, beta, rc, patch, minor, major');
		mergedOptions.versionLadder = mergedOptions.versionLadder.split(',').map((stage) => { return stage.trim(); });

		mergedOptions.ignoreFolders = options?.ignoreFolders ?? (this?._commandOptions.ignoreFolders ?? '');
		mergedOptions.ignoreFolders = mergedOptions.ignoreFolders.split(',').map((folder) => { return folder.trim(); });

		// Setting up the logs, according to the options passed in
		if(mergedOptions.debug) debugLib.enable('announce:*');

		let logger = null;
		const execMode = mergedOptions.execMode;

		if((execMode === 'api') && !mergedOptions.silent) { // eslint-disable-line curly
			logger = options?.logger;
		}

		if((execMode === 'cli') && !mergedOptions.silent) {
			const Ora = require('ora');
			logger = new Ora({
				'discardStdin': true,
				'text': `Preparing...`
			});

			logger?.start?.();
		}

		// Step 1: Get the current version from package.json
		const projectPackageJson = path.join(process.cwd(), 'package.json');
		debug(`processing ${projectPackageJson}`);
		if(execMode === 'api') logger?.debug?.(`processing ${projectPackageJson}`);

		const { version } = require(projectPackageJson);
		if(!version) {
			if(execMode === 'api')
				logger?.error?.(`${projectPackageJson} doesn't contain a version field.`);
			else
				logger?.fail?.(`${projectPackageJson} doesn't contain a version field.`);

			debug(`package.json at ${projectPackageJson} doesn't contain a version field.`);
			throw new Error(`${projectPackageJson} doesn't contain a version field.`);
		}
		if(!semver.valid(version)) {
			if(execMode === 'api')
				logger?.error?.(`${projectPackageJson} contains a non-semantic-version format: ${version}.`);
			else
				logger?.fail?.(`${projectPackageJson} contains a non-semantic-version format: ${version}.`);

			debug(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
			throw new Error(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
		}

		debug(`${projectPackageJson} contains version ${version}`);
		if(execMode === 'api')
			logger?.info?.(`${projectPackageJson} contains version ${version}`);
		else
			if(logger) logger.text = `Preparing... current version: ${version}`;

		// Step 2: Compute the next version
		debug(`applying ${mergedOptions.series} series to version ${version} using the ladder: ${safeJsonStringify(mergedOptions.versionLadder)}`);

		const incArgs = [version];
		const parsedVersion = semver.parse(version);

		switch (mergedOptions.series) {
			case 'current':
				if(parsedVersion?.prerelease?.length) {
					incArgs.push('prerelease');
					incArgs.push(parsedVersion?.prerelease[0]);
				}
				else {
					incArgs.push('patch');
				}
				break;

			case 'next':
				if(parsedVersion?.prerelease?.length) {
					let preReleaseTag = parsedVersion?.prerelease[0];

					const currentStep = mergedOptions.versionLadder.indexOf(preReleaseTag);
					if(currentStep === -1)
						preReleaseTag = 'patch';
					else if(currentStep === mergedOptions.versionLadder.length - 1)
						preReleaseTag = 'patch';
					else
						preReleaseTag = mergedOptions.versionLadder[currentStep + 1];

					if(preReleaseTag !== 'patch') incArgs.push('prerelease');
					incArgs.push(preReleaseTag);
				}
				else {
					incArgs.push('prerelease');
					incArgs.push(mergedOptions.versionLadder[0]);
				}
				break;

			case 'patch':
			case 'minor':
			case 'major':
				incArgs.push(mergedOptions.series);
				break;

			default:
				if(!semver.valid(mergedOptions.series)) {
					incArgs.length = 0;
					throw new Error(`Unknown series: ${mergedOptions.series}`);
				}
				break;
		}

		debug(`incrementing version using semver.inc(${incArgs.join(', ')})`);
		const nextVersion = incArgs.length ? semver.inc(...incArgs) : mergedOptions.series;

		debug(`${version} will be bumped to ${nextVersion}`);
		if(execMode === 'api')
			logger?.info?.(`${version} will be bumped to ${nextVersion}`);
		else
			logger?.succeed?.(`Preparing to bump current version: ${version} to next version: ${nextVersion}`);

		// Step 3: Get a hold of all the possible files where we need to change the version string.
		const { 'fdir': FDir } = require('fdir');

		debug(`crawling ${process.cwd()}`);
		if(execMode === 'api') logger?.debug?.(`crawling ${process.cwd()}s`);

		const crawler = new FDir().withFullPaths().crawl(process.cwd());
		let targetFiles = await crawler.withPromise();

		// eslint-disable-next-line security/detect-non-literal-fs-filename
		try {
			const fileSystem = require('fs/promises');
			const gitIgnorePath = path.join(process.cwd(), '.gitignore');

			debug(`processing ${gitIgnorePath}`);
			let gitIgnoreFile = await fileSystem.readFile(gitIgnorePath, { 'encoding': 'utf8' });
			gitIgnoreFile += `\n\n**/.git\n${mergedOptions.ignoreFolders.map((ignoredEntity) => { return ignoredEntity.trim(); }).join('\n')}\n\n`;

			gitIgnoreFile = gitIgnoreFile
				.split('\n')
				.map((gitIgnoreLine) => {
					if(gitIgnoreLine.trim().length === 0)
						return gitIgnoreLine.trim();

					if(gitIgnoreLine.startsWith('#'))
						return gitIgnoreLine;

					if(gitIgnoreLine.startsWith('**/'))
						return gitIgnoreLine;

					return `${gitIgnoreLine}\n**/${gitIgnoreLine}`;
				})
				.filter((gitIgnoreLine) => {
					return gitIgnoreLine.length;
				})
				.join('\n\n');

			debug(`.gitignore used:\n${gitIgnoreFile}`);

			debug(`parsing ${gitIgnorePath}`);
			const gitIgnoreParser = require('gitignore-parser');
			const gitIgnore = gitIgnoreParser.compile(gitIgnoreFile);

			debug(`applying .gitignore to possible targets`);
			targetFiles = targetFiles.filter(gitIgnore.accepts);
		}
		catch(err) {
			debug(`problem processing .gitignore: ${err.message}\n${err.stack}`);
		}

		// Step 4: Replace current version strong with next version string in all the target files
		debug(`modifying version to ${nextVersion} in: ${targetFiles.join(', ')}`);
		if(execMode === 'api') logger?.debug?.(`modifying version to ${nextVersion} in: ${targetFiles.join(', ')}`);

		const replaceInFile = require('replace-in-file');
		const replaceOptions = {
			'files': '',
			'from': '',
			'to': nextVersion
		};

		if(execMode !== 'api') {
			logger?.succeed?.(`Modifying target files:`);
			if(logger) logger.prefixText = '  ';
		}
		else {
			logger?.info?.(`modifying target files now`);
		}

		for(const targetFile of targetFiles) {
			if(execMode === 'api' && !mergedOptions.quiet)
				logger?.debug?.(`processing ${targetFile}`);
			else
				if(logger && !mergedOptions.quiet) logger.text = `processing ${targetFile}...`;

			replaceOptions.files = targetFile;
			if(path.basename(targetFile).startsWith('package'))
				replaceOptions.from = new RegExp(version, 'i');
			else
				replaceOptions.from = new RegExp(version, 'gi');

			const results = await replaceInFile(replaceOptions);
			if(!results.length) continue;

			results.forEach((result) => {
				if(!result.hasChanged)
					return;

				debug(`${result.file} bumped to ${nextVersion}`);
				// eslint-disable-next-line curly
				if(!mergedOptions.quiet) {
					if(execMode === 'api')
						logger?.debug?.(`${result.file} bumped to ${nextVersion}`);
					else
						logger?.succeed?.(`processed ${result.file}`);
				}
			});
		}

		if(execMode !== 'api' && logger)
			logger.prefixText = '';


		debug(`done bumping version from ${version} to ${nextVersion}`);
		if(execMode === 'api')
			logger?.info?.(`done bumping version from ${version} to ${nextVersion}`);
		else
			logger?.succeed?.(`Done bumping version from ${version} to ${nextVersion}`);
	}
	// #endregion

	// #region Private Fields
	// #endregion
}

// Add the command to the cli
let commandObj = null;
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	if(!commandObj) commandObj = new PrepareCommandClass(configuration?.prepare);

	commanderProcess
		.command('prepare')
		.option('-ss, --series <type>', 'Specify the series of the next release (current, next, patch, minor, major)', 'current')
		.option('-vl, --version-ladder <stages>', 'Specify the series releases used in the project', (configuration?.prepare?.versionLadder ?? 'dev, alpha, beta, rc, patch, minor, major'))
		.option('-if, --ignore-folders <folder list>', 'Comma-separated list of folders to ignore when checking for files containing the current version string', (configuration?.prepare?.ignoreFolders ?? ''))
		.action(commandObj.execute.bind(commandObj));

	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	if(!commandObj) commandObj = new PrepareCommandClass({ 'execMode': 'api' });
	return {
		'name': 'prepare',
		'method': commandObj.execute.bind(commandObj)
	};
};
