import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from 'fastify-multipart';
import path from 'path';
import fs from 'fs';
import crypto, { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { getRoast } from './roast.js';

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
});
fastify.register(fastifyMultipart);

fastify.get('/', (request, reply) => {
  reply.sendFile('index.html');
});

fastify.post('/upload', async (req, res) => {
  const parts = req.parts();
  let file;

  for await (const part of parts) {
    if (part.file) {
      if (file) {
        reply.status(400).send({ error: 'Only one image can be uploaded at a time' });
        return;
      }

      // Generate a random filename
      const randomFilename = generateRandomString(16) + path.extname(part.filename);

      // Define the path where the file will be saved
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }

      const filePath = path.join(uploadDir, randomFilename);

      // Create a write stream and save the file
      const writeStream = fs.createWriteStream(filePath);
      part.file.pipe(writeStream);

      // Wait until the file is fully written
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      file = {
        filename: randomFilename,
        mimetype: part.mimetype,
        encoding: part.encoding,
        path: filePath
      };
    }
  }

  if (!file) {
    res.status(400).send({ error: 'No image file uploaded' });
    return;
  }

  // Respond with success
  const roast = await getRoast(file, 'uploads')

  res.send({
    ok: true,
    text: roast
  });
})

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`Server is running at http://localhost:3000`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
