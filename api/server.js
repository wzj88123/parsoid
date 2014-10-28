#!/usr/bin/env node
/**
 * Cluster-based Parsoid web service runner. Implements
 * https://www.mediawiki.org/wiki/Parsoid#The_Parsoid_web_API
 *
 * Local configuration:
 *
 * To configure locally, add localsettings.js to this directory and export a setup function.
 *
 * example:
 *	exports.setup = function( config, env ) {
 *		env.setInterwiki( 'localhost', 'http://localhost/wiki' );
 *	};
 *
 * Alternatively, specify a --config file explicitly. See --help for other
 * options.
 *
 * See https://www.mediawiki.org/wiki/Parsoid/Setup for more instructions.
 */
"use strict";

require('es6-shim');

var cluster = require('cluster'),
	path = require('path'),
	util = require('util'),
	fs = require('fs');

// process arguments
var opts = require( "yargs" )
	.usage( "Usage: $0 [-h|-v] [--param[=val]]" )
	.default({
		// Start a few more workers than there are cpus visible to the OS,
		// so that we get some degree of parallelism even on single-core
		// systems. A single long-running request would otherwise hold up
		// all concurrent short requests.
		n: require( "os" ).cpus().length + 3,
		c: __dirname + '/localsettings.js',
		v: false,
		h: false
	})
	.boolean( [ "h", "v" ] )
	.alias( "h", "help" )
	.alias( "v", "version" )
	.alias( "c", "config" )
	.alias( "n", "num-workers" );

// Help
var argv = opts.argv;
if ( argv.h ) {
	opts.showHelp();
	process.exit( 0 );
}

// Version
var meta = require( path.join( __dirname, "../package.json" ) );
if ( argv.v ) {
	console.log( meta.name + " " + meta.version );
	process.exit( 0 );
}

var ParsoidService = require("./ParsoidService.js").ParsoidService,
	ParsoidConfig = require("../lib/mediawiki.ParsoidConfig").ParsoidConfig,
	Logger = require("../lib/Logger.js").Logger,
	PLogger = require("../lib/ParsoidLogger.js"),
	ParsoidLogger = PLogger.ParsoidLogger,
	ParsoidLogData = PLogger.ParsoidLogData;

// The global parsoid configuration object
var lsp = path.resolve( process.cwd(), argv.c ), localSettings;
try {
	localSettings = require( lsp );
} catch( e ) {
	console.error(
		"Cannot load local settings from %s. Please see: %s",
		lsp, path.join( __dirname, "localsettings.js.example" )
	);
	process.exit( 1 );
}

var parsoidConfig = new ParsoidConfig( localSettings, null );
var locationData = {
	isMaster: cluster.isMaster,
	toString: function() {
		return util.format(
			"[%s][%s]", this.isMaster ? "master" : "worker", process.pid
		);
	}
};

// Setup process logger
var logger = new Logger();
logger._createLogData = function( logType, logObject ) {
	return new ParsoidLogData( logType, logObject, locationData );
};
logger._defaultBackend = ParsoidLogger.prototype._defaultBackend;
ParsoidLogger.prototype.registerLoggingBackends.call(
	logger, [ "fatal", "error", "warning", "info" ], ParsoidConfig
);

if ( cluster.isMaster && argv.n > 0 ) {
	// Master

	var timeoutHandler, timeouts = new Map();
	var spawn = function() {
		if ( Object.keys(cluster.workers).length < argv.n ) {
			var worker = cluster.fork();
			worker.on('message', timeoutHandler.bind(null, worker));
		}
	};

	// Kill cpu hogs
	timeoutHandler = function( worker, msg ) {
		if ( msg.type !== "timeout" ) { return; }
		if ( msg.done ) {
			clearTimeout( timeouts.get( msg.reqId ) );
			timeouts.delete( msg.reqId );
		} else if ( msg.timeout ) {
			var pid = worker.process.pid;
			timeouts.set(msg.reqId, setTimeout(function() {
				timeouts.delete( msg.reqId );
				if ( worker.id in cluster.workers ) {
					logger.log( "warning", util.format( "Cpu timeout; killing worker %s.", pid ) );
					worker.kill();
					spawn();
				}
			}, msg.timeout));
		}
	};

	// Fork workers
	var worker;
	logger.log( "info", util.format( "initializing %s workers", argv.n ) );
	for (var i = 0; i < argv.n; i++) {
		spawn();
	}

	cluster.on('exit', function(worker, code, signal) {
		if ( !worker.suicide ) {
			var pid = worker.process.pid;
			logger.log( "warning", util.format( "worker %s died (%s), restarting.", pid, code ) );
			spawn();
		}
	});

	var shutdown_master = function() {
		logger.log( "info", "shutting down, killing workers" );
		cluster.disconnect(function() {
			logger.log( "info", "exiting" );
			process.exit(0);
		});
	};

	process.on('SIGINT', shutdown_master);
	process.on('SIGTERM', shutdown_master);

} else {
	// Worker

	process.on('SIGTERM', function() {
		logger.log( "warning", "shutting down" );
		process.exit(0);
	});

	// Enable heap dumps in /tmp on kill -USR2.
	// See https://github.com/bnoordhuis/node-heapdump/
	// For node 0.6/0.8: npm install heapdump@0.1.0
	// For 0.10: npm install heapdump
	process.on('SIGUSR2', function() {
		var heapdump = require('heapdump');
		logger.log( "warning", "SIGUSR2 received! Writing snapshot." );
		process.chdir('/tmp');
		heapdump.writeSnapshot();
	});

	var app = new ParsoidService( parsoidConfig, logger );

}
