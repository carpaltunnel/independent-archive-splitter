# independent-archive-splitter (aka tar-split + gzip)
A way to intelligently create multiple independent archives of a (general) specified size - no more byte split dependencies!  I thought this would be a common use case but I did a lot of searching and could only find one implementation... in [Plan9](https://9p.io/plan9/) from Bell Labs (see credits / inspiration section)

If you care about the why and how, skip down to "The Problem".  If not, look no further than the "How To" directly below.

# How To
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

# The Problem
I started looking into backing up my music library to cold cloud storage (Glacier and the like) but there were three main problems I faced.
1.  I wanted manageable chunks rather than a single (huge) monolithic archive to avoid problems with upload failures.
2.  Similar to problem #1, I wanted to be able to download a small subset of my library if I only needed to restore part of it.  For example, say I accidentally delete all albums by "[Jinjer](http://jinjer-metal.com/)" - I want to be able to download a smaller chunk like "all artists that start with 'J'" rather than the entire archive.
3.  And, as part of problem #2, all portions of the split archive must be independent.  That is, I want to be able to download a chunk that contains all artists that start with "J" and unarchive it independently without needing to download all pieces of the overall archive just to extract a small piece.

Problems #2 and #3 are where things got difficult.  Most archive utilities allow you to split the output (or it can be done with another utility like GNU coreutils `split`).  However, since they are simple byte splits, you need to have every piece of the archive available locally to extract one portion.  Also, if you lose one chunk of your split archive, all of it is unuseable.

# How
The only utility I could find that accomplished this was part of the [Plan9](https://9p.io/plan9/) OS from Bell Labs named [tar-split](https://github.com/0intro/plan9/blob/master/sys/src/cmd/tarsplit/tarsplit.c).  I looked through the code to get the gist of the logic but couldn't get it to compile on a modern *nix OS for a variety of reasons that I won't go into here.  So, I decided to duplicate (and extend) that logic.

So, I fired up an IDE and started hacking in Node.js.  Using a combination of [tar-stream](https://github.com/mafintosh/tar-stream) and [tar-fs](https://github.com/mafintosh/tar-fs) I was able to duplicate the logic.  Then, I added [zlib](https://nodejs.org/api/zlib.html) to do compression on the fly.  It's all done with streams so you don't have to worry about having multiple copies on disk and, as outlined in "Advantages" below... it's pretty speedy.

# Advantages
First of all, it solves all of the problems I faced around indepedent archives.  Second?  It's **FAST**!  The table below gives `time` measurements on my machine for archiving roughly 1GB of MP3s and FLACs into 300MB chunks.

| Utility  | Time  |  Results |
|---|---|---|
| tar -z  | 0m1.676s  | Fast archive + compression, but no splitting  |
| tar -z piped to split  | 0m24.804s  | Kind of slow and chunks are interdependent  |
| 7zip -v  | 0m56.796s  | Very slow and chunks are still interdependent  |
| tar-split  | 0m2.113s  | 0.5s slower than tar -z and all chunks are independent!  |

# Warnings
The split size is based on **uncompressed** file size.  I was splitting mostly compressed audio (MP3s) so this doesn't matter much to me - compressing a compressed file isn't going to give you much file size difference.  However, if you were to use this on highly compressable data (like text) with the compression flag, you can expect wildly different output file sizes (after compression) than what you specified as the split size.

# Credits / Inspiration
![Glenda](plan9-glenda.jpg "Glenda")
A lot of credit goes to [Plan9](https://9p.io/plan9/) for a tool that is still important today.  Also, big thanks to [mafintosh](https://github.com/mafintosh) for the Node.js tar libraries.
