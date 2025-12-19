/*
RDM Infinity, LLC
Written by: Brandon Robinson
Revised by: Braulio "Ben" Fernandez
Date: 03/28/24
Unpublished copywrite stuff goes here

Purpose: API server for Multivalue connections and stuff.
Revisions:
*/

// Required modules
const express = require("express");
const queue = require('express-queue');
const url = require('url');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

//maybe use these for the dymanic plugin stuff
//https://www.npmjs.com/package/express-dynamic-middleware
//https://www.npmjs.com/package/require-reload

// Set up the express app for HTTP requests
const app = express();

// Parse the body of the request as text
app.use(express.text({ type: '*/*' }));

// Status Monitor
app.use(require('express-status-monitor')({ title: "RDM Infinity - Connection Monitor" }));

// Initialize the server configuration
let serverConfig = false;
try {
	serverConfig = require(path.join(__dirname, 'configs', 'server.json'));
	if(!Object.keys(serverConfig).length) throw new Error();

	// Backward compatibility support for the old server configuration
	if(!('queue' in serverConfig.queue)) serverConfig.queue = {};
	if('queuing' in serverConfig.server) {
		serverConfig.queue.enable = serverConfig.server.queuing;
	}
	if('activeQueueLength' in serverConfig.server) {
		serverConfig.queue.activeLimit = serverConfig.server.activeQueueLength;
	}
	if('queuedLimit' in serverConfig.server) {
		serverConfig.queue.queuedLimit = serverConfig.server.queuedLimit;
	}
	if('serverPort' in serverConfig.server) {
		serverConfig.server.port = serverConfig.server.serverPort;
	}
} catch(e) {
	console.error("Config file missing or mis-formatted. Exiting...");
	process.exit(1);
	return false;
}

// Enable queuing if the server configuration specifies it
if(serverConfig.queue.enable == true) {
	app.use(queue({
		activeLimit: serverConfig.queue.activeLimit,
		queuedLimit: serverConfig.queue.queuedLimit,
		rejectHandler: (req, res) => { res.sendStatus(500); }
	}));
}

// Logging helper
const rdmLogger = require('./utils/rdmLogger');
const logger = new rdmLogger(serverConfig);

// Serve the asset folder as static files
app.use("/asset", express.static("asset"));
// Backward compatibility support for the static folder
app.use("/static", express.static("asset"));

// Middleware to process all requests
app.use(function(req, res, next) {
	// Set X-Powered-By header
	res.setHeader("X-Powered-By", "RDM Infinity rdmBuild - v2.3");

	// Set the serverConfig to the res.locals object
	res.locals.serverConfig = serverConfig;

	// Parse the query string into an object
	req.query = url.parse(req.url, true).query;

	// Assume the body is a JSON string and parse it into an object
	try {
		req.body = JSON.parse(req.body);
	} catch(e) {
		// Not a JSON string
	}

	// If the body still is a string, assume it's a URL encoded string and parse it into an object
	if(typeof req.body == 'string' && req.body != '') {
		req.body = req.body.split("&").reduce((acc, cur) => {
			let parts = cur.split("=");
			acc[parts[0]] = parts[1];
			return acc;
		}, {});
	}

	// Continue to the next middleware
	next();
});

// Start the server
if (serverConfig.ssl.enable) {
	const certificate = fs.readFileSync(path.join(__dirname, 'certs', serverConfig.ssl.cert), 'utf8');
	const privateKey = fs.readFileSync(path.join(__dirname, 'certs', serverConfig.ssl.key), 'utf8');
	const credentials = { key: privateKey, cert: certificate };
	require('https').createServer(credentials, app).listen(serverConfig.server.port, () => {
		console.log(`RDM Infinity rdmBuild v2.3 is running on port ${serverConfig.server.port}.`);
		console.log(`SSL is enabled. Using cert: ${serverConfig.ssl.cert} and key: ${serverConfig.ssl.key}`);
		if(!logger.enabled && !logger.console) console.log("Server started in silent mode. Logging is disabled.");
		if(process.env.watch == 'true') logger.info("Server started in watch mode. Logging to file is disabled.");
	});
} else {
	app.listen(serverConfig.server.port, () => {
		console.log(`RDM Infinity rdmBuild v2.3 is running on port ${serverConfig.server.port}.`);
		if(!logger.enabled && !logger.console) console.log("Server started in silent mode. Logging is disabled.");
		if(process.env.watch == 'true') logger.info("Server started in watch mode. Logging to file is disabled.");
	});
}

// Route handler for the /plugins endpoint
const pluginsDir = path.join(__dirname, 'plugins');
const plugins = ["status"];
fs.readdirSync(pluginsDir).forEach(dir => {
	// Load the plugin if it has an index.js file
	if(fs.existsSync(path.join(pluginsDir, dir, 'index.js'))) {
		app.use(`/plugins/${dir}`, require(`./plugins/${dir}/index`));
		logger.log('Plugin Loaded:', `/plugins/${dir}/index.js`);
		plugins.push(dir);
	}
});

// Send information to the client
app.get('/plugins/events/', (req, res) => {
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.flushHeaders();

	const data = JSON.stringify(plugins);
	res.write(`data: ${data}\n\n`);

	// Stop sending events when the client disconnects
	req.on('close', () => {
		res.end();
	});
});

// Landing page for the plugins endpoint
app.get('/plugins', (req, res, next) => {
	res.sendFile(path.join(__dirname, 'plugins', 'index.html'));
})

// Landing page handler
app.get('/', (req, res, next) => {
	res.sendFile(path.join(__dirname, 'plugins', 'index.html'));
})

// Check for Basic Authentication
if('auth' in serverConfig && serverConfig.auth.enable && serverConfig.auth.users) {
	app.use(require('express-basic-auth')({
		users: serverConfig.auth.users,
		challenge: serverConfig.auth.challenge,
		realm: serverConfig.auth.realm
	}));
}

// Route handler for the MV Database
app.use("/:service/:programName/:format?/:debug?", (req, res, next) => {

	// Check program name for special cases
	if(req.params.programName == "getAttr") {
		req.params.programName = "RDM.GET.ATTR";
	}

	// Convert the program name to uppercase
	req.params.programName = req.params.programName.toUpperCase();

	// Extract the parameters from the request
	const { service, programName, format, debug } = req.params;

	// If the service configuration is not found, try another middleware
	if(!fs.existsSync(path.join(__dirname, 'configs', service + '.json'))) {
		next();
		return;
	}

	// Set the serviceConfig to the res.locals object
	try {
		res.locals.serviceConfig = require(path.join(__dirname, 'configs', service + '.json'));
	} catch(e) {
		// Not a valid JSON file
		logger.error(`Config file "${service}" is not a valid JSON file.`);
		logger.error(e);
		res.status(500).end(JSON.stringify({ "error": "Cannot find " + service + " config!" }));
		return;
	}

	// Set start time
	res.locals.startTime = new Date().getTime();

	// Prepare the request object
	if(req.method == "POST") {
		req.rawQuery = Object.assign({}, req.query, req.body);
	} else {
		req.rawQuery = Object.assign({}, req.body, req.query);
	}

	// Add program name and source ip to the request
	req.rawQuery["env_program"] = programName;
	req.rawQuery["env_sourceip"] = req.ip.split(":").pop();

	// Join the rawQuery object into a string
	req.rawQuery = Object.keys(req.rawQuery).map(key => key + '=' + req.rawQuery[key]).join('&');

	// Check if logging is enabled for the service
	if('logging' in res.locals.serviceConfig) {
		if(!res.locals.serviceConfig.logging.enabled && !res.locals.serviceConfig.logging.console) logger.log(`Service "${service}" started in silent mode. Logging is disabled.`);
	}

	// Call the MV service
	mvCall(service, programName, format, debug, req.rawQuery, req, res);
});

function mvCall(service, program, format, debugFlag, varData, req, res) {
	// Start logger using the service configuration
	let logService = logger;
	if(debugFlag) {
		console.log("Debugging enabled. Forcing logging to enabled.");
		logService = new rdmLogger({ logging: { enable: true, console: true, path: "./debug.log" } });
	} else if('logging' in res.locals.serviceConfig) {
		logService = new rdmLogger(res.locals.serviceConfig);
		if(!logger.enabled && !logger.console) logService.log(`Server started in silent mode. Service "${service}" has logging enabled. Enabling logging for this service.`);
	}

	logService.info({ service, program, format, debugFlag, varData });

	// Get the service configuration from the res.locals object
	const serviceConfig = res.locals.serviceConfig;

	let outputStarted = false;

	logService.log(`Service ${service}: calling multivalue database`);
	logService.log(program, varData);

	const options = [];
	const defaults = {
		encoding: 'utf8',
		shell: true,
		env: process.env,
		timeout: 0
	};

	// Set CWD if it is defined in the service configuration
	if('serviceCWS' in serviceConfig.setup) {
		defaults.cwd = serviceConfig.setup.serviceCWS;
	}

	// Set the timeout if it is defined in the server configuration
	if('timeout' in serverConfig.server) {
		defaults.timeout = serverConfig.server.timeout;
	}

	// Set the timeout if it is defined in the service configuration
	if('dbTimeout' in serviceConfig.setup) {
		defaults.timeout = serviceConfig.setup.dbTimeout;
	}

	// Set the environment variables if they are defined in the service configuration
	if(serviceConfig.setup.env) {
		defaults.env = Object.assign({}, serviceConfig.setup.env);
	}

	// Attach the request headers to the environment variables
	defaults.env = Object.assign({}, defaults.env, req.headers);

	defaults.env.RDMLOGGING = serviceConfig.setup.serviceLogging;
	defaults.env.RDMLOGGINGPATH = serviceConfig.setup.serviceLogName;
	
	//switch db types because they are all stupid
	switch(serviceConfig.setup.dbType) {
		case "d3":
			options.push("-n");
			options.push(serviceConfig.setup.dbVM);
			options.push("-r");
			options.push("-d");
			options.push("\"\\f" + serviceConfig.setup.dbUser + "\\r" + serviceConfig.setup.dbPassword + "\\r" + program + "\ " + varData + "\\rexit\\r\"");
			options.push("-dcdon");
			options.push("-s");
			break;
		//Brandon - 1/16/22
		//Added for compatibility with \f not suppressing echo in normal d3 command
		case "d3tcl":
			options.push('"' + program + "\ " + varData + '"');
			break;
		case "jBase":
			// logService.info(serviceConfig.setup.env);
			options.push("-");
			options.push("-c");
			options.push('"' + program + "\ " + varData + '"');
			break;
		case "uv":
			options.push("-d");
			options.push(serviceConfig.setup.dbVM);
			options.push("-r");
			options.push("-d");
			options.push("\"\\f" + serviceConfig.setup.dbUser + "\\r" + serviceConfig.setup.dbPassword + "\\r" + program + "\ " + varData + "\\rexit\\r\"");
			options.push("-dcdon");
			options.push("-s");
			break;
		case "d3Win":
			//for d3Win use the dbUser as the DB account name
			options.push("-n");
			options.push(serviceConfig.setup.dbVM);
			options.push("-r");
			options.push("-d");
			options.push("\"\\f" + serviceConfig.setup.dbUser + "\\r" + serviceConfig.setup.dbPassword + "\\r" + program + "\ " + varData + "\\rexit\\r\"");
			options.push("-dcdon");
			options.push("-s");
			defaults.windowsHide = true;
			break;
		case "qm":
			//This could be used for ScarletDME also. Set the names of the configs to the correct thing
			options.push("-QUIET");
			options.push("-A" + serviceConfig.setup.dbVM);
			options.push(program + "\ " + varData);
			break;
		default:
			logService.error(`Database type "${serviceConfig.setup.dbType}" not supported.`);
			res.status(500).end(JSON.stringify({ "error": `Database type "${serviceConfig.setup.dbType}" not supported.` }));
			return;
	}

	const child = spawn(serviceConfig.setup.dbBinary, options, defaults);

	//example request for d3 for reference
	// const child = spawn("/usr/bin/d3", 
	//             ["-n","pick0","-r","-d","\"\\frdmscuser\\r\\r"+program+"\ "+varData+"\\rexit\\r\"","-dcdon","-s"],
	//             {
	//               encoding : 'utf8',
	//               shell: true,
	//               timeout: 10000
	//           });

	//logService.info(child);
	// use child.stdout.setEncoding('utf8'); if you want text chunks
	if(format) {
		res.type(format.toString());
	}

	// let FinalData = "";
	child.stdout.on('data', (data) => {
		// data from the standard output is here as buffers
		//logService.info(process.env);
		logService.info("Output started:", outputStarted);
		//logService.info(data.toString());
		//FinalData += data.toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
		data = data.toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
		logService.info(data);
		//Steve is the magic man that came up with this MUCH smaller version of this. Removed from child.on.close so we can get the chunks of data as they process
		if(!outputStarted) {
			//Except this. This was Brandons magic not Steve's
			outputStarted = data.indexOf('~~START~~') > -1;
		}
		logService.info("Output already started:", outputStarted);

		let string = data.indexOf('~~START~~') > -1 ? data.split('~~START~~')[1] : data;
		let output = string.split('~~END~~')[0];
		if(outputStarted) {
			if(debugFlag) {
				res.type("json");
				const debug = {
					"params": req.params,
					"headers": req.headers,
					"body": req.body,
					"query": req.query,
					"binary": {
						"command": `${serviceConfig.setup.dbBinary} ${options.join(' ')}`,
						"defaults": defaults
					},
					"data": varData,
					"time": {
						"start": res.locals.startTime,
						"end": new Date().getTime(),
						"elapsedSeconds": (new Date().getTime() - res.locals.startTime) / 1000
					},
					"output": output
				};
				logService.info("Debugging enabled. Sending debug data to client.");
				logService.log(debug);
				res.end(JSON.stringify(debug));
				return;
			}
		
			res.write(output);
		}
	});

	//Update for certain systems to disconnect on exit vs close
	child.on('exit', (code) => {
		logService.log(`Service ${service} (${program}): process exited with code ${code}`);
		res.end();
	});

	child.on('close', (code) => {
		logService.log(`Service ${service} (${program}): process closed with code ${code}`);

		// data = FinalData.toString().replace(/[^\x00-\x7F]/g, "").replace(/\x00/g,"");
		// //logService.info(data);
		// begOutput = data.toString().split('~~START~~');
		// // logService.info(begOutput.length);    //   logService.info(begOutput.length);

		// if(begOutput.length > 1)
		// {
		//   midOutput = begOutput[1].split('~~END~~');
		//   sendOutput = midOutput[0];
		//   sendOutput = sendOutput.toString().replace(/[^\x00-\x7F]/g, "").replace(/\x00/g,"");
		// }
		// else
		// {
		//   //TODO - standarize an error here
		//   sendOutput = "ERROR RUNNING DB COMMAND"
		//   logService.info("Else clause hit. Give me the data");
		//   logService.info(FinalData);
		//   logService.info("500 hit!!!");
		//   res.status(500);
		// }
		// logService.info("all the data");
		// res.write(sendOutput.trim());
		res.end();
	});

	//strange std out error happened. Panic...
	child.stderr.on('data', (data) => {
		logService.error(`Service ${service} (${program}):`);
		logService.error(data.toString());
	});
	// since these are streams, you can pipe them elsewhere
	//child.stderr.pipe(dest);

	child.on('error', (error) => {
		logService.error(`Service ${service} (${program}):`);
		logService.error(error);
		res.status(500).end(JSON.stringify({ "error": "Default connection timeout limit. Check server config if needed." }));
	});

	//TODO - Look at the worker threads here.
	// seprateThread.on("message", (result) => {
	// 	logService.info("Processed function getSum on seprate thread: ");
	// 	logService.info(result);
	// 	// res.send(`Processed function getSum on seprate thread: ${result}`);
	// });
	// seprateThread.postMessage(1000);
}