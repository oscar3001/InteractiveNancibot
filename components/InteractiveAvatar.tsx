import { Configuration, StreamingAvatarApi } from "@heygen/streaming-avatar";
import { Button, Card, CardBody, Spinner } from "@nextui-org/react";
import { useEffect, useRef, useState, useCallback } from "react";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export default function InteractiveAvatar() {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [debug, setDebug] = useState<string>("");
  const [dynamicText, setDynamicText] = useState<string>(
    "Texto predefinido a repetir"
  );
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const avatarId = "676a3ab0273440418ceb007502ab372c";
  const voiceId = "5a9c9650cfca44ca98d6b2297c7fb5e2";
  const socket = useRef<WebSocket | null>(null);
  const captions = useRef<HTMLDivElement>(null);

  // Usar useRef para almacenar el estado del avatar y evitar problemas de actualización
  const avatarState = useRef<string>("avatar_stop_talking");

  // Crear una referencia para el botón de interrumpir
  const interruptButtonRef = useRef<HTMLButtonElement | null>(null);

  // Guardar referencia al temporizador
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Nueva variable de estado para controlar la interrupción
  const hasInterrupted = useRef<boolean>(false);

  // Función para manejar la interrupción
  const handleInterrupt = useCallback(async () => {
    if (!initialized || !avatar.current) {
      setDebug((prev) => prev + "\nAvatar API not initialized");
      return;
    }
    console.log("Interrupting avatar");
    await avatar.current
      .interrupt({ interruptRequest: { sessionId: sessionId } })
      .catch((e) => {
        setDebug((prev) => prev + `\n${e.message}`);
      });
    // Marcar como interrumpido
    hasInterrupted.current = true;
  }, [initialized, avatar.current, sessionId]);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token);
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      setDebug((prev) => prev + `\nError fetching access token: ${error}`);
      return "";
    }
  }

  async function startSession() {
    setIsLoadingSession(true);
    await updateToken();
    if (!avatar.current) {
      setDebug((prev) => prev + "\nAvatar API is not initialized");
      return;
    }
    try {
      const res = await avatar.current.createStartAvatar(
        {
          newSessionRequest: {
            quality: "medium",
            avatarName: avatarId,
            voice: { voiceId: voiceId },
          },
        },
        setDebug
      );
      setVideoStream(avatar.current.mediaStream);
      setSessionId(res.sessionId);

      // Llama a openMicrophone aquí, en respuesta a una acción del usuario
      await openMicrophone(); // Espera a que el usuario conceda el permiso

      startTranscription();
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug((prev) => prev + `\nError starting session: ${error}`);
    }
    setIsLoadingSession(false);
  }

  async function updateToken() {
    const newToken = await fetchAccessToken();
    if (!newToken) {
      setDebug((prev) => prev + "\nFailed to fetch access token");
      return;
    }
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    const startTalkCallback = (e: any) => {
      console.log("Avatar started talking", e);
      avatarState.current = "avatar_start_talking"; // Usar avatarState.current
      hasInterrupted.current = false; // Resetear la bandera al iniciar a hablar
      console.log("Avatar state updated to:", "avatar_start_talking");
    };

    const stopTalkCallback = (e: any) => {
      console.log("Avatar stopped talking", e);
      avatarState.current = "avatar_stop_talking"; // Usar avatarState.current
      hasInterrupted.current = false; // Resetear la bandera al detenerse
      console.log("Avatar state updated to:", "avatar_stop_talking");
    };

    avatar.current.addEventHandler("avatar_start_talking", startTalkCallback);
    avatar.current.addEventHandler("avatar_stop_talking", stopTalkCallback);

    setInitialized(true);
  }

  async function endSession() {
    if (!initialized || !avatar.current) {
      setDebug((prev) => prev + "\nAvatar API not initialized");
      return;
    }
    await avatar.current.stopAvatar(
      { stopSessionRequest: { sessionId: sessionId } },
      setDebug
    );
    setVideoStream(null);
    setAudioStream(null);
    stopTranscription();
  }

  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!initialized || !avatar.current) {
      setDebug((prev) => prev + "\nAvatar API not initialized");
      return;
    }
    if (!sessionId) {
      setDebug((prev) => prev + "\nSession ID not set");
      return;
    }
    await avatar.current
      .speak({ taskRequest: { text: dynamicText, sessionId: sessionId } })
      .catch((e) => {
        setDebug((prev) => prev + `\n${e.message}`);
      });
    setIsLoadingRepeat(false);
  }

  async function openMicrophone() {
    try {
      console.log("Requesting microphone access...");
      setDebug((prev) => prev + "\nRequesting microphone access...");
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      console.log("Microphone access granted");
      setDebug((prev) => prev + "\nMicrophone access granted");
      setAudioStream(audioStream);

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/webm",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.current?.readyState === WebSocket.OPEN) {
          console.log("Sending audio data...");
          socket.current.send(event.data);
        }
      };

      mediaRecorder.start(500);
    } catch (error) {
      console.error("Microphone access denied or error:", error);
      setDebug((prev) => prev + "\nError accessing microphone");
    }
  }

  async function startTranscription() {
    socket.current = new WebSocket("wss://interactivenancibot.onrender.com:3001");

    socket.current.addEventListener("open", () => {
      console.log("WebSocket: connected");
      setDebug((prev) => prev + "\nWebSocket: connected");
    });
      socket.current.addEventListener("close", (event) => {
    console.log("WebSocket: disconnected", event.code, event.reason);
    setDebug(`WebSocket disconnected: ${event.reason}`);
  });

  socket.current.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
    setDebug("WebSocket error");
  });

    let user_dice = "";

    socket.current.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.channel?.alternatives[0]?.transcript) {
        const transcript = data.channel.alternatives[0].transcript;
        const isFinal = data.is_final;
        const speechFinal = data.speech_final;

        console.log("Transcript received:", transcript);
        console.log("is_final:", isFinal, "speech_final:", speechFinal);

        // Revisar si el avatar está hablando y el botón no ha sido presionado
        if (avatarState.current === "avatar_start_talking" && !hasInterrupted.current) {
          console.log(
            "Avatar is talking and partial transcript received. Interrupting..."
          );

          // Simular un clic en el botón de interrumpir
          if (interruptButtonRef.current) {
            interruptButtonRef.current.click();
          }
        }

        if (isFinal) {
          user_dice += transcript + " ";
          console.log("Current user_dice:", user_dice);

          // Iniciar temporizador de 2 segundos si is_final es True y speech_final es False
          if (!speechFinal) {
            timerRef.current = setTimeout(() => {
              // Forzar el envío de user_dice como Final User Transcript si no se cancela
              if (isFinal && !speechFinal) {
                console.log("Forced Final User Transcript:", user_dice);
                processFinalUserTranscript(user_dice); // Usar el flujo natural
                user_dice = ""; // Limpiar user_dice después de procesar
              }
            }, 2000);
          }
        }

        // Cancelar temporizador si is_final es False o speech_final es True
        if (!isFinal || speechFinal) {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }

        // Procesar Final User Transcript
        if (speechFinal) {
          processFinalUserTranscript(user_dice);
          user_dice = ""; // Reinicia user_dice después de imprimir la transcripción completa
        }
      }
    });

    socket.current.addEventListener("close", () => {
      console.log("WebSocket: disconnected");
      setDebug((prev) => prev + "\nWebSocket: disconnected");
    });
  }

  // Unificar el flujo de procesamiento para Final User Transcript
  const processFinalUserTranscript = async (transcript: string) => {
    console.log("Processing transcript:", transcript);
    setDebug((prev) => prev + `\nProcessing transcript: ${transcript}`);
    const startTime = performance.now(); // Start timer

    // Verificar usando avatarState.current
    if (avatarState.current === "avatar_start_talking") {
      console.log(
        "Avatar is talking and final user transcript received. Interrupting..."
      );

      // Simular un clic en el botón de interrumpir
      if (interruptButtonRef.current) {
        interruptButtonRef.current.click();
      }
    } else {
      console.log("Avatar is not talking. No action taken.");
    }

    try {
      // Llamada a la API de OpenAI usando chat.completions
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini-2024-07-18",
        messages: [
          { role: "system", content: "Eres un sommelier virtual experto en vinos, responde de manera muy breve ya que estas en una videollamada, as preguntas al usuario para conocer que le gusta mas" },
          { role: "user", content: transcript },
        ],
      });

      const responseText = response.choices[0]?.message?.content || "No response";
      const endTime = performance.now(); // End timer
      const duration = endTime - startTime;

      console.log("OpenAI response:", responseText);
      console.log(`Request duration: ${duration.toFixed(2)} ms`);

      // Actualizar el texto dinámico con el valor recibido de OpenAI
      setDynamicText(responseText);
    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      setDebug((prev) => prev + `\nError calling OpenAI API: ${error}`);
    }
  };

  function stopTranscription() {
    if (socket.current) {
      socket.current.close();
      socket.current = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
      setAudioStream(null);
    }
  }

  useEffect(() => {
    async function init() {
      const newToken = await fetchAccessToken();
      avatar.current = new StreamingAvatarApi(
        new Configuration({ accessToken: newToken, jitterBuffer: 200 })
      );
      setInitialized(true);
    }
    init();

    return () => {
      endSession();
    };
  }, []);

  useEffect(() => {
    if (videoStream && mediaStream.current) {
      console.log("Setting stream to video element");
      mediaStream.current.srcObject = videoStream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug((prev) => prev + "\nPlaying");
      };
    } else {
      console.warn("Stream or mediaStream not set");
      setDebug((prev) => prev + "\nStream or mediaStream not set");
    }
  }, [mediaStream, videoStream]);

  // Nuevo useEffect para activar automáticamente el botón "Repetir"
  useEffect(() => {
    if (dynamicText !== "Texto predefinido a repetir") {
      handleSpeak();
    }
  }, [dynamicText]);

  return (
    <div
      className="w-full h-full flex flex-col gap-0"
      style={{
        overflow: "hidden",
        margin: 0,
        padding: 0,
        backgroundImage: 'url("https://forevertalents.com/wp-content/uploads/2024/07/nanci-bot-background.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Card
        style={{
          position: "relative",
          height: "100vh",
          width: "100vw",
          backgroundColor: "transparent", // Eliminar fondo
          boxShadow: "none", // Eliminar sombras
          border: "none", // Eliminar bordes
        }}
      >
        <CardBody
          className="flex flex-col justify-center items-center p-0 m-0"
          style={{ height: "100vh", width: "100vw", margin: 0, padding: 0 }}
        >
          {videoStream ? (
            <div className="w-full h-full flex justify-center items-center m-0 p-0 rounded-lg overflow-hidden">
              <video
                ref={mediaStream}
                autoPlay
                playsInline
                style={{
                  width: "100vw",
                  height: "100vh",
                  objectFit: "cover",
                  margin: 0,
                  padding: 0,
                  display: "block",
                }}
              >
                <track kind="captions" />
              </video>
            </div>
          ) : !isLoadingSession ? (
            <Button
              size="md"
              onClick={startSession}
              className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white"
              variant="shadow"
            >
              Iniciar sesión
            </Button>
          ) : (
            <Spinner size="lg" color="default" />
          )}
          {/* Cuadro de texto para mostrar mensajes de depuración */}
          <textarea
            readOnly
            value={debug}
            style={{
              width: "100%",
              height: "200px",
              marginTop: "20px",
              padding: "10px",
              backgroundColor: "#f0f0f0",
              color: "#333",
              border: "1px solid #ccc",
              borderRadius: "8px",
              resize: "none",
            }}
          />
        </CardBody>
        {/* Posicionar los botones de manera absoluta sobre el video */}
        <div
          className="flex gap-2 justify-center"
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <Button
            size="md"
            onClick={endSession}
            className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
            variant="shadow"
          >
            Detener
          </Button>
          <Button
            size="md"
            ref={interruptButtonRef} // Asignar la referencia aquí
            onClick={handleInterrupt}
            className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
            variant="shadow"
            style={{ display: "none" }} // Ocultar botón Interrumpir
          >
            Interrumpir
          </Button>
          <Button
            size="md"
            onClick={handleSpeak}
            className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
            variant="shadow"
            style={{ display: "none" }} // Ocultar botón Repetir
          >
            Repetir
          </Button>
        </div>
      </Card>
    </div>
  );
}
