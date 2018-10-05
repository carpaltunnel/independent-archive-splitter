/*
    tar-split.js - an efficient way to generate independent archives from an existing tar file or from a directory.
    gzip compression is available (but optional)

    Author : carpaltunnel
    Inspiration : tar-split from Plan9 from Bell Labs

    Example command to split an existing tar file (NOT compressed) into 300MB chunks and compress it :
        node tar-split.js --input mytarfile.tar  --outputPrefix myPrefix --splitSize 300 --gzipOutput --overwriteExisting --manifest
    
    Example command to create independent, compressed, tar.gz files from a directory in 300MB chunks : 
        node tar-split.js --input myFolder --outputPrefix myPrefix --splitSize 300 --gzipOutput --overwriteExisting --manifest

    Command line arguments :
        --input <string/path> or -i : Path to an existing tar file or a directory if creating a new archive (recommended)
        --outputPrefix <string> or -o : Prefix for the generated independent archives
        --splitSize <int> or -s : Maximum size for each output archive (see Warnings) in *MB*
        --gzipOutput <boolean> or -z : Compress the output archives with GZip compression (generates a .tar.gz)
        --overwriteExisting <boolean> or -f : If the target archives exist, overwrite them.
        --manifest <boolean> or -m : Generate a text file that shows the files that are contained in each generated archive.  
            Useful for finding where a certain file landed.
        --verbose <boolean> or -v : Show file names as they are added and print when new splits are created.

    Warnings : 
        Split Size is based on *uncompressed* file size.  If you're archiving already compressed data like music or video
            then this probably won't make a noticeable difference.  If you're archiving highly compressable data (like text) 
            with the -z flag then you're going to get inconsistent results when it comes to output file size.
*/
const fs = require('fs');
const tarFs = require('tar-fs');
const tarStream = require('tar-stream');
const commandLineArgs = require('command-line-args');
const zlib = require('zlib');

const optionDefinitions = [
    { name: 'splitSize', alias: 's', type: Number },
    { name: 'input', alias: 'i', type: String },
    { name: 'outputPrefix', alias: 'o', type: String },
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'overwriteExisting', alias: 'f', type: Boolean },
    { name: 'gzipOutput', alias: 'z', type: Boolean },
    { name: 'manifest', alias: 'm', type: Boolean },
];
const options = commandLineArgs(optionDefinitions);
const outputPrefix = options.outputPrefix ? options.outputPrefix : 'output';

// Check for required params
if (!options.splitSize || !options.input) {
    throw new Error('--input (-i) and --splitSize (-s) are required parameters!');
}

if (!fs.existsSync(options.input)) {
    throw new Error(`Specified input '${options.input}' does not exist!`);
}

let newArchive = false;
if (fs.lstatSync(options.input).isDirectory()) {
    console.log(`Specified input '${options.input}' is a directory - assuming you want to create a new archive from it.`);
    newArchive = true;
}

const overwriteExisting = options.overwriteExisting || false;
const extractStream = tarStream.extract();
const archiveSize = options.splitSize * 1048576;
let runningSize = 0;
let currentSplit = 0;
let packStream = null;
let outputFileStream = null;
let outManifestFileStream = null;

function checkExisting() {
    if (!overwriteExisting && fs.existsSync(options.gzipOutput ? `./${outputPrefix}-${currentSplit}.tar.gz` : `./${outputPrefix}-${currentSplit}.tar`)) {
        throw new Error(`overwriteExisting flag is false but output file (${options.gzipOutput ? `./${outputPrefix}-${currentSplit}.tar.gz` : `./${outputPrefix}-${currentSplit}.tar`}) exists!  If you would live to overwrite existing files, specify the --overwriteExisting (or -f) flag.  Exiting...`);
    }
}

extractStream.on('entry', (header, inStream, next) => {
    // Check for files that are bigger than split size
    if (header.size > archiveSize) {
        throw new Error(`A single file (${header.name}) has a file size (${(header.size / 1048576).toFixed(2)} MB) larger than the maximum specified archive splitSize of ${options.splitSize} MB`);
    }

    !options.verbose || console.log(`Input : Found filename of ${header.name} of type ${header.type} with size of ${header.size} bytes`);

    // If it fits, jam it in
    if (runningSize + header.size < archiveSize) {
        runningSize += header.size;
        inStream.pipe(packStream.entry(header, next));
        if (options.manifest) {
            outManifestFileStream.write(`${header.name}\n`);
        }
    } else {
        currentSplit++;
        // Close previous packStream and finishing writing output file
        packStream.finalize();
        outputFileStream.close();
        outManifestFileStream.end();
        checkExisting();

        // Initialize new packStream and new output file stream
        packStream = tarStream.pack();
        // If --gzipOutput is true, pipe the tar through zlib and add .gz extension
        outputFileStream = options.gzipOutput ? zlib.createGzip().pipe(fs.createWriteStream(`./${outputPrefix}-${currentSplit}.tar.gz`)) : fs.createWriteStream(`./${outputPrefix}-${currentSplit}.tar`);
        packStream.pipe(outputFileStream);
        inStream.pipe(packStream.entry(header, next));

        // if --manifest is specified, generate a manifest file
        if (options.manifest) {
            outManifestFileStream = fs.createWriteStream(`./${outputPrefix}-${currentSplit}.manifest`);
            outManifestFileStream.write(`${header.name}\n`);
        }

        runningSize = header.size;
        !options.verbose || console.log(`\nFile of size ${header.size} bytes is too large to fit in this archive with max archiveSize of ${options.splitSize}.  Starting a new archive : ${outputPrefix}-${currentSplit}.tar${options.gzipOutput ? '.gz' : ''}`);
    }
});

extractStream.on('finish', function() {
    !options.verbose || console.log('All done!');
});

// Initialize everything at the beginning
checkExisting();
packStream = tarStream.pack();

// If --gzipOutput is true, pipe the tar through zlib and add .gz extension
outputFileStream = options.gzipOutput ? zlib.createGzip().pipe(fs.createWriteStream(`./${outputPrefix}-${currentSplit}.tar.gz`)) : fs.createWriteStream(`./${outputPrefix}-${currentSplit}.tar`);
packStream.pipe(outputFileStream);

// if --manifest is specified, generate a manifest file
if (options.manifest) {
    outManifestFileStream = fs.createWriteStream(`./${outputPrefix}-${currentSplit}.manifest`);
}

// Setup the input and let it flow
const input = newArchive ? tarFs.pack(options.input) : fs.createReadStream(options.input);
input.pipe(extractStream);
