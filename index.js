const express = require('express');
const { google } = require('googleapis');
// const request = require('request');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = 3000;

const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectURI = process.env.REDIRECT_URI;
const accessToken = process.env.ACCESS_TOKEN;
const refreshToken = process.env.REFRESH_TOKEN;
const tokenExpiryDate = process.env.TOKEN_EXPIRY_DATE;

// Initialize Google Drive API
const drive = google.drive('v3');

// OAuth2 Client setup  
const oauth2Client = new google.auth.OAuth2(
  clientID,
  clientSecret,
  redirectURI
);

// Generate an access token  
oauth2Client.setCredentials({
  access_token: accessToken,
  refresh_token: refreshToken,
  token_type: 'Bearer',
  expiry_date: tokenExpiryDate
});

// Function to download a file from Google Drive
async function downloadFile(fileId, destinationPath) {
  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destinationPath);
    drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream', auth: oauth2Client },
      (err, response) => {
        if (err) {
          reject(err);
          return;
        }

        response.data
          .on('end', () => {
            resolve(destinationPath);
          })
          .on('error', (err) => {
            reject(err);
          })
          .pipe(dest);
      }
    );
  });
}

// Function to upload a file to Google Drive in chunks
async function uploadFileInChunks(file, destinationFolderId) {
  return new Promise(async (resolve, reject) => {
    const fileSize = fs.statSync(file).size;
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks

    // resumable upload session
    const resumableSession = await drive.files.create(
      {
        resource: {
          name: 'YourNewFileName.mp4',
          parents: [destinationFolderId],
        },
      },
      { auth: oauth2Client, media: { body: '' } }
    );

    const fileId = resumableSession.data.id;
    const sessionURL = resumableSession.data.capabilities.resumable.create;
    const fileStream = fs.createReadStream(file);

    let currentByte = 0;

    fileStream.on('data', async (chunk) => {
      currentByte += chunk.length;

      const isLastChunk = currentByte === fileSize;

      const options = {
        url: sessionURL,
        method: 'PUT',
        headers: {
          'Content-Length': isLastChunk ? fileSize % chunkSize : chunkSize,
          'Content-Range': `bytes ${currentByte - chunk.length}-${currentByte - 1}/${fileSize}`,
        },
      };

      // Send the chunk to Google Drive
      request(options, (error, response, body) => {
        if (error) {
          reject(error);
        }

        if (isLastChunk) {
          resolve(fileId);
        }
      });
    });
  });
}

// API endpoint to start the download and upload process
app.get('/process', async (req, res) => {
  const sourceFileId = 'YOUR_SOURCE_FILE_ID';
  const destinationFolderId = 'YOUR_DESTINATION_FOLDER_ID';

  // Download the file
  const downloadedFilePath = await downloadFile(sourceFileId, 'video.mp4');

  // Upload the downloaded file to the destination folder
  const uploadedFileId = await uploadFileInChunks(downloadedFilePath, destinationFolderId);

  res.json({ message: 'Process completed', uploadedFileId });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
