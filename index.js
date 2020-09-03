/**
 * @name		index.js
 * @file		Main entry point of the Twy'r Announce CLI tool
 * @version		0.0.1-dev.0
 *
 * @author		Vish Desai <shadyvd@hotmail.com>
 * @copyright	(c) {@link https://twyr.github.io/annouce|Twy'r} 2016-2020
 *
 * @license		MITNFA
 */

'use strict';

/**
 * Module dependencies, required for ALL Twy'r modules
 * @ignore
 */

/**
 * Module dependencies, required for this module
 * @ignore
 */

// Sanity check for node versions
const pkg = require('./package.json');
require('please-upgrade-node')(
	Object.assign({}, pkg, {
		'engines': {
			// eslint-disable-next-line no-inline-comments
			'node': '>=14.0' // First version with optional chaining and nullish coalescing
		}
	})
);

// Step 0: Load the configuration
const { cosmiconfigSync } = require('cosmiconfig');
const explorer = cosmiconfigSync('announce', {
	'searchPlaces': [
		'package.json',
		'.announcerc',
		'.announcerc.json',
		'.announcerc.yaml',
		'.announcerc.yml',
		'.announcerc.js',
		'announce.config.js'
	]
});

const configuration = explorer.search();

// Step 1: Crawl the commands folder and get the list of available commands
const { 'fdir': FDir } = require('fdir');
const { join } = require('path');

const crawler = new FDir()
	.withFullPaths()
	.withErrors()
	.glob('./**/*-command.js');

const commandDefinitionFolder = join(__dirname, './commands');
const availableCommandDefinitionFiles = crawler.crawl(commandDefinitionFolder).sync();

// Step 2: Initialize the API and return that
for(const commandDefinitionFile of availableCommandDefinitionFiles) {
	// eslint-disable-next-line
	const { apiCreator } = require(commandDefinitionFile);
	const api = apiCreator?.(configuration ?.config);

	exports[api.name] = api.method;
}