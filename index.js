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
})

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
});

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10485760 // 10 MB
  }
});

fastify.register(cfTurnstile, {
  sitekey: process.env.TURNSTILE_KEY,
  privatekey: process.env.TURNSTILE_SECRET,
})

fastify.register(fastifyCors, {
  origin: (origin, callback) => {
    if (process.env.ENV !== 'production' && process.env.NODE_ENV !== 'production')
      return callback(null, true);

    if (origin === 'https://image-roaster.dtherm.shop') {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  }
});

fastify.get('/', (request, reply) => {
  reply.sendFile('index.html');
});

fastify.post('/upload', {
  preValidation: fastify.cfTurnstile,
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

  const roast = await getRoast(file)

  if (await roast) {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
  }

  res.send({
    ok: true,
    text: roast
  });
});

fastify.put('/cfs', (req, res) => {
  res.send(Buffer.from(process.env.TURNSTILE_KEY).toString('base64'));
});

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
