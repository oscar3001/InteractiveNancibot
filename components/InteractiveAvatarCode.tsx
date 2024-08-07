import { useState, useEffect, useRef } from "react";
import {
  Configuration,
  NewSessionData,
  StreamingAvatarApi,
} from "@heygen/streaming-avatar";
import Vapi from "@vapi-ai/web";
import ErrorBoundary from "./ErrorBoundary"; // Importa el componente de manejo de errores

export default function App() {
  const [stream, setStream] = useState<MediaStream>();
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const [sessionData, setSessionData] = useState<NewSessionData>();
  const [initialized, setInitialized] = useState(false);
  const [debug, setDebug] = useState<string>("Avatar API not initialized");

  // Variables locales para almacenar el texto concatenado
  const userTranscript = useRef<string>("");
  const modelOutput = useRef<string>("");
  const modelOutputTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize Vapi with your public key
  const vapi = useRef(new Vapi("1950065d-0fde-4642-bdde-ecc6409bcca7")); // Replace 'your-web-token' with your actual Vapi public key

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Función para inicializar y reproducir el audio en bucle
  const initializeAudio = async () => {
    if (audioRef.current) return; // Evita inicializar más de una vez

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.2; // Ajusta el volumen aquí

    const audioElement = new Audio("/pil_canela.mp3");
    audioElement.loop = true;

    const track = audioContext.createMediaElementSource(audioElement);
    track.connect(gainNode).connect(audioContext.destination);

    audioRef.current = audioElement;
    audioElement.play().catch(console.error);
  };

  // Función para obtener un nuevo token de acceso
  async function fetchAccessToken() {
    try {
      const options = {
        method: "POST",
        headers: {
          accept: "application/json",
          "x-api-key": "MmFjYzRlZjMyZjE1NGNjODkwMzA1ZGE1N2NjZDhlM2ItMTcyMjQ3MTE1Nw==", // Reemplaza con tu clave API
        },
      };

      const response = await fetch(
        "https://api.heygen.com/v1/streaming.create_token",
        options
      );
      const data = await response.json();

      if (response.ok) {
        console.log("Access Token:", data.data.token); // Log del token para verificar
        return data.data.token;
      } else {
        console.error("Error fetching access token:", data.error);
        return "";
      }
    } catch (error) {
      console.error("Error fetching access token:", error);
      return "";
    }
  }

  // Función para enviar un ICE candidate al servidor
  async function sendIceCandidate(candidate) {
    if (!sessionData?.sessionId) {
      console.error("Session ID is not available for ICE candidate");
      return;
    }

    const options = {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": "MmFjYzRlZjMyZjE1NGNjODkwMzA1ZGE1N2NjZDhlM2ItMTcyMjQ3MTE1Nw==", // Reemplaza con tu clave API
      },
      body: JSON.stringify({
        session_id: sessionData.sessionId,
        candidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment,
        },
      }),
    };

    try {
      const response = await fetch(
        "https://api.heygen.com/v1/streaming.ice",
        options
      );
      const result = await response.json();
      console.log("ICE candidate sent, response:", result);
    } catch (error) {
      console.error("Error sending ICE candidate:", error);
    }
  }

  // Función para actualizar el token y configurar el avatar
  async function updateToken() {
    const newToken = await fetchAccessToken();
    console.log("Updating Access Token:", newToken); // Log token for debugging
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken, jitterBuffer: 150 })
    );

    // Asegúrate de que los callbacks de eventos estén configurados
    const startTalkCallback = (e: any) => {
      console.log("Avatar started talking", e);
    };

    const stopTalkCallback = (e: any) => {
      console.log("Avatar stopped talking", e);
    };

    // Agregar manejadores de eventos
    console.log("Adding event handlers:", avatar.current);
    avatar.current.addEventHandler("avatar_start_talking", startTalkCallback);
    avatar.current.addEventHandler("avatar_stop_talking", stopTalkCallback);

    setInitialized(true);
  }

  async function start() {
    if (initialized) {
      setDebug("Avatar API already initialized");
      return;
    }

    try {
      await updateToken();
      const res = await avatar.current!.createStartAvatar({
        newSessionRequest: {
          quality: "low",
          avatarName: "e4c17778854d498fbaf942dc6b7079c4",
          voice: { voiceId: "2d18aa7c2ca04548adac93904354322f" },
        },
      });
      setSessionData(res);
      setStream(avatar.current!.mediaStream);
      console.log("Avatar session started successfully");

      // Start Vapi call
      await vapi.current.start("26b4c2c2-91a9-4b30-b116-59982902bc5b"); // Replace 'your-assistant-id' with your actual assistant ID
      console.log("Vapi call started");

      // Configurar el manejo de eventos ICE
      if (avatar.current!.peerConnection) {
        avatar.current!.peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("New ICE candidate:", event.candidate);
            sendIceCandidate(event.candidate);
          }
        };

        avatar.current!.peerConnection.oniceconnectionstatechange = (event) => {
          console.log(
            "ICE Connection State Changed:",
            event.target.iceConnectionState
          );
          setDebug(`ICE Connection State: ${event.target.iceConnectionState}`);
        };
      }

      // Inicializa y reproduce el audio
      initializeAudio();
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug(`Error starting session: ${error.message}`);
    }
  }

  async function stop() {
    if (!initialized || !avatar.current) return;

    try {
      await avatar.current.stopAvatar({
        stopSessionRequest: { sessionId: sessionData?.sessionId },
      });
      setStream(undefined);
      console.log("Avatar session stopped successfully");
      setDebug("Session stopped");

      // Stop Vapi call
      await vapi.current.stop();
      console.log("Vapi call stopped");

      // Limpiar el objeto de medios para liberar recursos
      if (mediaStream.current && mediaStream.current.srcObject) {
        const tracks = (mediaStream.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
        mediaStream.current.srcObject = null;
      }

      // Pausa el audio si está reproduciendo
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } catch (error) {
      console.error("Error stopping avatar session:", error);
      setDebug(`Error stopping session: ${error.message}`);
    }
  }

  async function handleSpeak() {
    if (!initialized || !avatar.current) return;

    try {
      await avatar.current.speak({
        taskRequest: {
          text: "<TEXT_TO_SAY>",
          sessionId: sessionData?.sessionId,
        },
      });
      console.log("Avatar speaking...");
    } catch (error) {
      console.error("Error in handleSpeak:", error);
      setDebug(`Error speaking: ${error.message}`);
    }
  }

  // Función para enviar el texto a la API del avatar
  async function sendTextToAvatar(text: string) {
    if (!sessionData?.sessionId) {
      console.error("Session ID is not available");
      return;
    }

    const options = {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": "MmFjYzRlZjMyZjE1NGNjODkwMzA1ZGE1N2NjZDhlM2ItMTcyMjQ3MTE1Nw==", // Reemplaza con tu clave API
      },
      body: JSON.stringify({
        session_id: sessionData.sessionId,
        text: text,
        task_mode: "sync", // Puede ser 'async' si prefieres
        task_type: "repeat", // Puede ser 'repeat' si solo deseas que repita el texto
      }),
    };

    try {
      const response = await fetch(
        "https://api.heygen.com/v1/streaming.task",
        options
      );
      const result = await response.json();
      console.log("Text sent to avatar, response:", result);
    } catch (error) {
      console.error("Error sending text to avatar:", error);
    }
  }

  // Función para interrumpir la tarea del avatar
  async function interruptTask() {
    if (!sessionData?.sessionId) {
      console.error("Cannot interrupt, session ID is not available");
      return;
    }

    const options = {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": "MmFjYzRlZjMyZjE1NGNjODkwMzA1ZGE1N2NjZDhlM2ItMTcyMjQ3MTE1Nw==", // Reemplaza con tu clave API
      },
      body: JSON.stringify({
        session_id: sessionData.sessionId,
      }),
    };

    try {
      const response = await fetch(
        "https://api.heygen.com/v1/streaming.interrupt",
        options
      );
      const result = await response.json();
      console.log("Interrupt task response:", result);
    } catch (error) {
      console.error("Error interrupting task:", error);
    }
  }

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
      };
    }
  }, [mediaStream, stream]);

  useEffect(() => {
    // Solo añadir los manejadores de eventos una vez
    const handleMessage = (msg) => {
      if (
        msg.type === "transcript" &&
        msg.transcriptType === "final" &&
        msg.role === "user"
      ) {
        console.log("Final User Transcript:", msg.transcript);
        userTranscript.current += msg.transcript + " "; // Concatenar el texto del usuario
      }
      if (msg.type === "speech-update") {
        if (msg.status === "started" && msg.role === "assistant") {
          console.log("Assistant started speaking");
          // Verificar si la variable tiene contenido significativo antes de imprimir
          if (userTranscript.current.trim() !== "") {
            console.log("Texto Concatenado del Usuario:", userTranscript.current); // Imprimir el texto concatenado
          }
          userTranscript.current = ""; // Limpiar la variable local
        }
        if (msg.status === "stopped" && msg.role === "assistant") {
          console.log("Assistant stopped speaking");
        }
      }
      // Manejo del nuevo evento "model-output"
      if (msg.type === "model-output") {
        if (msg.output && typeof msg.output === "string") {
          modelOutput.current += msg.output; // Concatenar los fragmentos de salida del modelo

          // Reiniciar el temporizador cada vez que se recibe un nuevo token
          if (modelOutputTimer.current) {
            clearTimeout(modelOutputTimer.current);
          }

          // Establecer un nuevo temporizador para imprimir la salida completa después de 400 ms de inactividad
          modelOutputTimer.current = setTimeout(() => {
            if (modelOutput.current.trim() !== "") {
              console.log("Model Output Concatenado:", modelOutput.current); // Imprimir el output completo
              // Solo enviar el texto si sessionData está disponible
              if (sessionData?.sessionId) {
                sendTextToAvatar(modelOutput.current); // Enviar el texto al avatar
              } else {
                console.error("Cannot send text, session ID is not available");
              }
              modelOutput.current = ""; // Limpiar la variable local después de imprimir
            }
          }, 200);
        }
      }
      // Manejo del evento "user-interrupted"
      if (msg.type === "user-interrupted") {
        console.log("User interrupted the assistant");
        interruptTask(); // Llamar a la función de interrupción
      }
    };

    vapi.current.on("message", handleMessage);

    // Limpiar los manejadores de eventos al desmontar el componente
    return () => {
      vapi.current.off("message", handleMessage);
    };
  }, [sessionData]); // Añadir dependencia para asegurarse de que sessionData esté actualizado

  return (
    <ErrorBoundary>
      {" "}
      {/* Envuelve la aplicación con el componente de manejo de errores */}
      <style>
        {
          `.nextjs-toast-errors-parent {
            display: none !important;
          }`
        }
      </style>
      <div
        className="relative w-full h-screen overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: "url('https://forevertalents.com/wp-content/uploads/2024/07/nanci-bot-background.jpg')" }}
      >
        <video
          className="absolute top-0 left-0 w-full h-full object-cover"
          playsInline
          autoPlay
          ref={mediaStream}
        />
        <div className="absolute bottom-0 left-0 w-full flex justify-between items-center z-10 p-4">
          <button
            className="bg-[#fa7c46] text-white font-bold py-2 px-4 rounded shadow-2xl"
            style={{ boxShadow: '0px 4px 15px rgba(0, 0, 0, 0.5)' }}
            onClick={start}
          >
            Llamar
          </button>
          <button
            className="bg-[#fa7c46] text-white font-bold py-2 px-4 rounded shadow-2xl"
            style={{ boxShadow: '0px 4px 15px rgba(0, 0, 0, 0.5)' }}
            onClick={stop}
            disabled={!initialized}
          >
            Colgar
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
