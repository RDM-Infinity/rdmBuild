# README

rdmBuild v2.3 service connector allows for calls into a Multivalue database to return formatted data to the calling end point. This version supports D3, jBase, Universe, QM, and ScarletDME. This is not a complete implentation of the RESTful API Spec. Requests are allowed via both POST and GET to the end point.

The current build supports Linux, AIX, and Windows

### Install Steps

Install NodeJS and NPM to your Multivalue system.

Copy the project into your desired directory. 

> npm install  

This will install the needed packages and code to support rdmBuild.

When complete run the following to lauch the service. Use tools like "[pm2](https://github.com/Unitech/pm2)" or "[qckwinsvc](https://github.com/tallesl/qckwinsvc)" to run the program in the backgroud to respond to calls.

> node riWweb.js

### Configure the service entry point for your system

Create the service to control the MV database specifics for your enviroment. Note that you will need to match up your jBase enviroment paths to the correct env variables in jBase setups.

#### D3 Sample (other samples in the "configs" folder for jBase, QM, etc...). **UPDATE WITH VARIABLES FOR YOUR SPECIFIC ENVIRONMENT**

rdm.json:

	{
		"setup": {
			"dbType": "d3",
			"dbBinary": "/usr/bin/d3",
			"dbUser": "RDMWEB",
			"dbAccount": "RDM",
			"dbPassword": "INFINITY",
			"dbVM": "pick0"
		}
	}

### Multivalue code install

Once logged into your MV database create a file for the helper routines (not required but extremely helpful). Recommended location is RDM.LIBS

Example (depending on our implementation): CREATE-FILE RDM.LIBS 3 11 

Copy the install script inside of the mvCode into your favorite terminal emulator. This will create the following subroutines:
 - RDM.GET.DATA
  - A routine to convert any HTTP encoded in your varstring into useable MV arrays
 - RDM.SEND.DATA
  - A routine to send back data with the proper `~~START~~` and `~~END~~` tags through rdmBuild
 - FORMAT.ERROR
  - A routine that accepts a MV array of error messages that will format them in JSON or XML based on the options passed
  
- **Compile and catalog the above routines**
 
## Sample MultiValue code to parse incoming variables and return a response

**NOTE: The program must be cataloged so that the connector can call the program*

	****
	*
	* XML.TEST.CONNECTION
	*
	********************************
	*IF YOU DO NOT WANT TO USE THE SENTENCE() YOU CAN SET THIS UP AS PROC
	*  Example (Change FILE.BP to the program location below):
	*    
	*  ED MD XML.TEST.CONNECTION
	*     1 = PQ
	*     2 = HRUN FILE.BP XML.TEST.CONNECTION
	*     3 = P
	********************************
	* COMNMENT THIS OUT IF YOU USE A PROC
	VARS = SENTENCE()
	*
	*  IF YOU USE A PROC STYLE ENTRY FOR THIS THEN REMOVE THE "TCL" IN THIS HELPER
	*  EX: CALL RDM.GET.DATA(VARS,"")
	*
	CALL RDM.GET.DATA(VARS,"TCL")
	LOCATE "var" IN VARS<1> SETTING POS THEN
		VAR = VARS<2,POS>
	END ELSE
		VAR = ""
	END
	XML = '<success>':VAR:'</success>'
	*or
	JSON = '{"success":"':VAR:'"}'
	*
	*PASS THE XML OR JSON HERE TO SEND IT BACK IF USING THE HELPER FUNCTION
	CALL RDM.SEND.DATA(XML,"")
	STOP

## Calling XML.TEST.CONNECTION via the API

Using a tool such as Postman (https://www.getpostman.com/) or a web browser hit the following URL:

- Localhost will be replaced with your MV server address. 
- Port 9191 can be configured in your server.json file in the configs directory
- SERVICE_NAME will correspond to the above service file that was created for your environment

GET version:

http://YOUR_MULTIVALUE_SERVER:9191/service_name/XML.TEST.CONNCTION/?var=MV%20is%20cool

POST version:

POST http://YOUR_MULTIVALUE_SERVER:9191/service_name/XML.TEST.CONNECTION

var=MV%20is%20cool

## Response from the XML.TEST.CONNECTION Call (XML or JSON)

	<success>MV is cool</success>

or (depending on what you send)

	{"success":"MV is cool"}

## Basic Authentication

Make sure the express-basic-auth package is installed. This will allow for basic authentication to be used with the service.

	npm install express-basic-auth

To use basic authentication, add the following to your server.json file in the configs directory:

	"auth": {
		"enable": true,
		"users": {
			"admin": "pass",
			"user": "test"
		},
		"challenge": true,
		"realm": false
	}

| Key | Description |
| --- | --- |
| enable | Enable or disable basic authentication. |
| users | Object containing username and password pairs. |
| challenge | Enable or disable challenge response. This will cause most browsers to show a popup to enter credentials on unauthorized responses. |
| realm | Set the realm for the challenge response. |

## SSL Support
To enable SSL support, you will need to update the server.json file in the configs directory to include the ssl section as shown below:

	"ssl": {
		"enable": true,
		"cert": "server.crt",
		"key": "server.key"
	}

| Key | Description |
| --- | --- |
| enable | Enable or disable SSL support. |
| cert | Path to the SSL certificate file. |
| key | Path to the SSL private key file. |

### Generating Self-Signed SSL Certificates for Testing
You can generate self-signed SSL certificates using OpenSSL for testing purposes. Use the following command:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout server.key -out server.crt
```
Copy both the `server.crt` and `server.key` files to the `certs` directory in your project root and enable SSL in the server.json file as described above.
