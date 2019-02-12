const express = require('express');
const path = require('path');
const errorHandler = require('express-json-errors');

// File system stuff
const fs = require('fs');
const glob = require("glob").Glob;
const replace = require('stream-replace');

// RDF stuff
const N3 = require('n3');
const N3Parser = require('n3-parser.js').N3Parser;
const {
    DataFactory
} = N3;
const {
    namedNode
} = DataFactory;

// URL stuff
// Is unfortunate that there is no method to get the current URL.
const url = require('url');
function fullUrl(req) {
    return url.format({
        protocol: req.protocol,
        host: req.get('host'),
        pathname: req.originalUrl
        // And that slashes are arbitrarily appended
    }).replace(/\/$/, "");
}

function getBaseURL(req) {
    return url.format({
        protocol: req.protocol,
        host: req.get('host')        
        // And that slashes are arbitrarily appended
    }).replace(/\/$/, "");
}

let prefixes = {
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    http: 'http//www.w3.org/2011/http#>',
    hydra: 'http://www.w3.org/ns/hydra/context.jsonld',
    oslo: 'http://oslo.example.org#',
    agent: 'http://fast.example.org/agent#',
    ldp: 'http://www.w3.org/ns/ldp#',
    dcterms: 'http://purl.org/dc/terms/',
    ex: 'http://localhost:3000/example-vocab#'
};

const workSpacePath = path.join(__dirname, './mock');

const app = express();
app.use(errorHandler());
const port = 3000;

let rdf_extensions = ['.ttl','.n3','.rdf'];
function isInArray(value, array) { return array.indexOf(value) > -1; }
function isRDFFile(filename){
    let current = path.extname(filename);
    return isInArray(current,rdf_extensions);
}

const isDirectory = source => fs.lstatSync(source).isDirectory();
const getDirectories = source => fs.readdirSync(source).map(name => path.join(source, name)).filter(isDirectory);


app.get('/**', (req, res) => {
    let currentURL = fullUrl(req);
    let baseURL = getBaseURL(req);
    let currentDirectory = path.join(workSpacePath, req.originalUrl);
    let directoryPattern = path.join(currentDirectory, '/*');

    let parser = N3.Parser(currentURL); // BaseIRI is current URL
    const writer = N3.Writer({prefixes: prefixes});

    if (!fs.existsSync(currentDirectory)||!isDirectory(currentDirectory)){
        res.error({code: 404, title: 'No resources found', description: currentDirectory+" is not a valid directory"});
    } else {
        // Writes ldp container stuff
        writer.addQuad(
            namedNode(currentURL),
            namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            namedNode('http://www.w3.org/ns/ldp#Container'),
        );

        // Writes the RDF from the files
        getDirectories(currentDirectory).forEach(current => addContainerLink(current));
        glob(directoryPattern, { nodir:true}, function (er, files) {
            let filesToProcess = files.filter(isRDFFile);
            if (filesToProcess.length > 0){
                filesToProcess.forEach(current => parseFile(current));
            } else {
                serializeResponse();
            }
        });
    }

    function addContainerLink(dir) {
        writer.addQuad(
            namedNode(currentURL),
            namedNode('http://www.w3.org/ns/ldp#contains'),
            namedNode(currentURL + '/' + path.parse(dir).base),
        );
    }

    // parse a file, and replace 'current' with the server uri
    function parseFile(file) {
        console.log('Adding ', file);
        let rdfStream = fs.createReadStream(file)
            .pipe(replace(/{{current}}/g, currentURL))
            .pipe(replace(/{{base}}/g, baseURL));

        parser.parse(rdfStream, (error, quad, prefixes) => {
            if (error){
                error.description = file;
                console.log(error);
                res.error(error);
            }
            if (quad) {
                writer.addQuad(quad);
            } else {
                serializeResponse();
            }
        });
    }

    function serializeResponse() {
        writer.end((error, result) => {
            console.log(result);
            let parser = new N3Parser();
            // Return a JSON-LD representation
            let jsonld = parser.toJSONLD(result);
            res.json(jsonld);
        });
    }

});

app.listen(port, () => console.log(`Mock API running on port ${port}.\nMounted in:\n` + workSpacePath));