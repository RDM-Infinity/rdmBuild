const util = require('util');

class rdmLogger {
	constructor(config) {
		// Avoid undefined config
		if(!config.logging) config.logging = {};

		// Enable logging to a file
		this.enabled = 'enable' in config.logging ? config.logging.enable : true;

		// Disable logging to file if in watch mode
		if(process.env.watch == 'true') this.enabled = false;

		// Enable logging to console
		this.console = 'console' in config.logging ? config.logging.console : true;

		// Create log file
		if('file' in config.logging && config.logging.path.trim() != '') {
			this.logFile = fs.createWriteStream(config.logging.path, { flags: 'a' }); // 'a' for appending, 'w' for truncating
		}
	}

	// Log to console and file
	log() {
		if(this.console) process.stdout.write(`${util.format.apply(null, arguments)}\n`);
		if(this.enabled && this.logFile) this.logFile.write(`[${new Date().toISOString()}] ${util.format.apply(null, arguments)}\n`);
	}

	// Log errors to console and file
	error() {
		if(this.console) process.stderr.write(`${util.format.apply(null, arguments)}\n`);
		if(this.enabled && this.logFile) this.logFile.write(`[${new Date().toISOString()}] ${util.format.apply(null, arguments)}\n`);
	}

	// Display info to console only
	info() {
		if(this.console) process.stdout.write(`${util.format.apply(null, arguments)}\n`);
	}
}

module.exports = rdmLogger;