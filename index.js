import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import cfTurnstile from 'fastify-cloudflare-turnstile';
import { getRoast } from './roast.js';
import fastifyRateLimit from '@fastify/rate-limit';

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: true,
  bodyLimit: 10485760
});

await fastify.register(fastifyRateLimit, {
  max: 50,
  timeWindow: '1 minute'
});

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
});

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10485760 // 10 MB
  }
});

// Register Turnstile if keys are provided
if (process.env.TURNSTILE_KEY && process.env.TURNSTILE_SECRET) {
  fastify.register(cfTurnstile, {
    sitekey: process.env.TURNSTILE_KEY,
    privatekey: process.env.TURNSTILE_SECRET,
  });
} else {
  console.log("TURNSTILE_KEY or TURNSTILE_SECRET not provided. Skipping cfTurnstile registration.");
}

// Register CORS
fastify.register(fastifyCors, {
  origin: process.env.ORIGIN
});

fastify.get('/', (request, reply) => {
  reply.sendFile('index.html');
});

fastify.post('/upload', {
  preValidation: process.env.TURNSTILE_KEY ? fastify.cfTurnstile : undefined,
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'
    }
  }
}, async (req, res) => {
  const parts = req.parts();
  let file;

  for await (const part of parts) {
    if (part.file) {
      if (file) {
        res.status(400).send({ error: 'Only one image can be uploaded at a time' });
        return;
      }

      const randomFilename = generateRandomString(16) + path.extname(part.filename);
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }

      const filePath = path.join(uploadDir, randomFilename);
      const writeStream = fs.createWriteStream(filePath);
      part.file.pipe(writeStream);

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', (err) => {
          reject(err);
        });
      });

      file = {
        filename: randomFilename,
        mimetype: part.mimetype,
        encoding: part.encoding,
        path: filePath
      };
    }
  }

  try {
    const roast = await getRoast(file);

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    res.send({
      ok: true,
      text: roast
    });
  } catch (error) {
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

fastify.put('/cfs', (req, reply) => {
  if (process.env.TURNSTILE_KEY) {
    reply.send(Buffer.from(process.env.TURNSTILE_KEY).toString('base64'));
  } else {
    reply.send(null);
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`Server is running at http://0.0.0.0:3000`);
  } catch (err) {
    fastify.log.error('Server startup error:', err);
    process.exit(1);
  }
};

start();
