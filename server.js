const express = require("express");
const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const dotenv = require("dotenv");
dotenv.config();

const app = express();


// Crear el servidor HTTPS
const server = https.createServer(options, app);

// Crear el servidor WebSocket sobre HTTPS
const wss = new WebSocket.Server({ server });

const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
let keepAlive; // Mantener una referencia global para el intervalo

const setupDeepgram = (ws) => {
  const deepgram = deepgramClient.listen.live({
    smart_format: true,
    model: "nova-2",
    language: "multi",
    vad_events: true,
    interim_results: true,
    utterance_end_ms: 1000,
    endpointing: 200,
  });

  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive");
    deepgram.keepAlive();
  }, 10 * 1000);

  deepgram.on(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.on(LiveTranscriptionEvents.Transcript, (data) => {
      console.log("deepgram: transcript received");
      console.log("ws: transcript sent to client");
      ws.send(JSON.stringify(data));
    });

    deepgram.on(LiveTranscriptionEvents.Close, async () => {
      console.log("deepgram: disconnected");
      clearInterval(keepAlive); // Detener el intervalo keep-alive
      deepgram.finish();
    });

    deepgram.on(LiveTranscriptionEvents.Error, async (error) => {
      console.log("deepgram: error received");
      console.error(error);
      clearInterval(keepAlive); // Detener el intervalo en caso de error
    });

    deepgram.on(LiveTranscriptionEvents.Warning, async (warning) => {
      console.log("deepgram: warning received");
      console.warn(warning);
    });

    deepgram.on(LiveTranscriptionEvents.Metadata, (data) => {
      console.log("deepgram: metadata received");
      console.log("ws: metadata sent to client");
      ws.send(JSON.stringify({ metadata: data }));
    });
  });

  return deepgram;
};

wss.on("connection", (ws) => {
  console.log("ws: client connected");
  let deepgram = setupDeepgram(ws);

  ws.on("message", (message) => {
    console.log("ws: client data received");

    if (deepgram.getReadyState() === 1 /* OPEN */) {
      console.log("ws: data sent to deepgram");
      deepgram.send(message);
    } else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
      console.log("ws: data couldn't be sent to deepgram");
      console.log("ws: retrying connection to deepgram");
      /* Intentar reabrir la conexión con Deepgram */
      deepgram.finish();
      deepgram.removeAllListeners();
      deepgram = setupDeepgram(ws);
    } else {
      console.log("ws: data couldn't be sent to deepgram");
    }
  });

  ws.on("close", () => {
    console.log("ws: client disconnected");
    clearInterval(keepAlive); // Detener el intervalo al cerrar la conexión
    deepgram.finish();
    deepgram.removeAllListeners();
    deepgram = null;
  });
});

app.use(express.static("public/"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Cambia el puerto a un puerto HTTPS, si necesario
server.listen(10001, () => {
  console.log("Server is listening on port 10001");
});
