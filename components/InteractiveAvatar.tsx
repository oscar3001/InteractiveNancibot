// interactiveavatar.jsx
import { Configuration, StreamingAvatarApi } from "@heygen/streaming-avatar";
import { Button, Card, CardBody, Spinner } from "@nextui-org/react";
import { useEffect, useRef, useState, useCallback } from "react";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

// Configuración de la API de Deepgram
const deepgramApiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;

export default function InteractiveAvatar() {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [debug, setDebug] = useState<string>("");
  const [dynamicText, setDynamicText] = useState<string>(
    "Texto predefinido a repetir"
  );
  const [logMessages, setLogMessages] = useState<string[]>([]); // Nuevo estado para los mensajes de consola
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const avatarId = "676a3ab0273440418ceb007502ab372c";
  const voiceId = "5a9c9650cfca44ca98d6b2297c7fb5e2";
  const captions = useRef<HTMLDivElement>(null);

  // Usar useRef para almacenar el estado del avatar y evitar problemas de actualización
  const avatarState = useRef<string>("avatar_stop_talking");

  // Crear una referencia para el botón de interrumpir
  const interruptButtonRef = useRef<HTMLButtonElement | null>(null);

  // Guardar referencia al temporizador
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Nueva variable de estado para controlar la interrupción
  const hasInterrupted = useRef<boolean>(false);

  // Usar useRef para almacenar user_dice y persistir su estado
  const userDiceRef = useRef<string>("");

  // Crear una referencia para almacenar el historial de la conversación
  const conversationHistory = useRef([]);

  // Función para manejar la interrupción
  const handleInterrupt = useCallback(async () => {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    console.log("Interrupting avatar");
    await avatar.current
      .interrupt({ interruptRequest: { sessionId: sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
    // Marcar como interrumpido
    hasInterrupted.current = true;
  }, [initialized, avatar.current, sessionId]);

  // Nueva función para añadir mensajes al log
  const addLogMessage = (message: string) => {
    setLogMessages((prev) => [...prev, message]);
  };

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token);
      addLogMessage("Access Token: " + token); // Añadir al log
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      addLogMessage("Error fetching access token: " + error.message); // Añadir al log
      return "";
    }
  }

  async function startSession() {
    setIsLoadingSession(true);
    await updateToken();
    if (!avatar.current) {
      setDebug("Avatar API is not initialized");
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
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug(
        `There was an error starting the session. ${
          voiceId ? "This custom voice ID may not be supported." : ""
        }`
      );
    }
    setIsLoadingSession(false);
  }

  async function updateToken() {
    const newToken = await fetchAccessToken();
    if (!newToken) {
      setDebug("Failed to fetch access token");
      return;
    }
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    const startTalkCallback = (e: any) => {
      console.log("Avatar started talking", e);
      addLogMessage("Avatar started talking: " + JSON.stringify(e)); // Añadir al log
      avatarState.current = "avatar_start_talking"; // Usar avatarState.current
      hasInterrupted.current = false; // Resetear la bandera al iniciar a hablar
      console.log("Avatar state updated to:", "avatar_start_talking");
      addLogMessage("Avatar state updated to: avatar_start_talking"); // Añadir al log
    };

    const stopTalkCallback = (e: any) => {
      console.log("Avatar stopped talking", e);
      addLogMessage("Avatar stopped talking: " + JSON.stringify(e)); // Añadir al log
      avatarState.current = "avatar_stop_talking"; // Usar avatarState.current
      hasInterrupted.current = false; // Resetear la bandera al detenerse
      console.log("Avatar state updated to:", "avatar_stop_talking");
      addLogMessage("Avatar state updated to: avatar_stop_talking"); // Añadir al log
    };

    avatar.current.addEventHandler("avatar_start_talking", startTalkCallback);
    avatar.current.addEventHandler("avatar_stop_talking", stopTalkCallback);

    setInitialized(true);
  }

  async function endSession() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
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
      setDebug("Avatar API not initialized");
      return;
    }
    if (!sessionId) {
      setDebug("Session ID not set");
      return;
    }
    await avatar.current
      .speak({ taskRequest: { text: dynamicText, sessionId: sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
    setIsLoadingRepeat(false);
  }

  // Deepgram options to be editable
  const deepgramOptions = {
    vad_events: true,
    interim_results: true,
    endpointing: 300,
    utterance_end_ms: "1000",
    language: "multi",
    model: "nova-2",
  };

  async function openMicrophone() {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setAudioStream(audioStream);

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/mpeg", // Asegúrate de que el códec es compatible
      });

      const deepgramSocket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?vad_events=${deepgramOptions.vad_events}&interim_results=${deepgramOptions.interim_results}&endpointing=${deepgramOptions.endpointing}&utterance_end_ms=${deepgramOptions.utterance_end_ms}&language=${deepgramOptions.language}&model=${deepgramOptions.model}`,
        ["token", deepgramApiKey]
      );

      deepgramSocket.onopen = () => {
        console.log("WebSocket connection opened to Deepgram");
        addLogMessage("WebSocket connection opened to Deepgram"); // Añadir al log
        mediaRecorder.start(250); // Start recording with 250ms buffer size
      };

      deepgramSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Deepgram response:", data);
          addLogMessage("Deepgram response: " + JSON.stringify(data)); // Añadir al log

          // Handle SpeechStarted event
          if (data.type === "SpeechStarted") {
            console.log("Speech started at timestamp:", data.timestamp);
            return; // Skip further processing for SpeechStarted
          }

          // Handle transcription results
          if (data.type === "Results") {
            const { alternatives } = data.channel;
            if (!alternatives || alternatives.length === 0) {
              console.log("No alternatives available in the result.");
              return;
            }

            const transcript = alternatives[0].transcript;
            const isFinal = data.is_final;
            const speechFinal = data.speech_final;

            console.log("Transcript received:", transcript);
            console.log("is_final:", isFinal, "speech_final:", speechFinal);
            addLogMessage(
              `Transcript received: ${transcript} | is_final: ${isFinal} | speech_final: ${speechFinal}`
            ); // Añadir al log

            if (
              transcript.trim() !== "" && // Verificar que el transcripto no esté vacío
              avatarState.current === "avatar_start_talking" &&
              !hasInterrupted.current
            ) {
              console.log(
                "Avatar is talking and partial transcript received. Interrupting..."
              );
              addLogMessage(
                "Avatar is talking and partial transcript received. Interrupting..."
              ); // Añadir al log
              if (interruptButtonRef.current) {
                interruptButtonRef.current.click();
              }
            }

            if (isFinal) {
              if (transcript.trim() !== "") {
                userDiceRef.current += transcript + " ";
                console.log("Current user_dice:", userDiceRef.current);
                addLogMessage("Current user_dice: " + userDiceRef.current); // Añadir al log
              }

              if (!speechFinal) {
                timerRef.current = setTimeout(() => {
                  if (isFinal && !speechFinal && userDiceRef.current.trim() !== "") {
                    console.log(
                      "Forced Final User Transcript:",
                      userDiceRef.current
                    );
                    addLogMessage(
                      "Forced Final User Transcript: " + userDiceRef.current
                    ); // Añadir al log
                    processFinalUserTranscript(userDiceRef.current);
                    userDiceRef.current = ""; // Limpiar después de procesar
                  }
                }, 2000);
              }
            }

            if (!isFinal || speechFinal) {
              if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
              }
            }

            if (speechFinal) {
              if (userDiceRef.current.trim() !== "") {
                processFinalUserTranscript(userDiceRef.current);
                userDiceRef.current = ""; // Limpiar después de procesar
              } else {
                console.log("Final transcript was empty, not processing.");
                addLogMessage("Final transcript was empty, not processing."); // Añadir al log
              }
            }
          } else {
            console.log("Received unexpected message type:", data.type);
            addLogMessage("Received unexpected message type: " + data.type); // Añadir al log
          }
        } catch (error) {
          console.error("Error processing Deepgram response:", error);
          setDebug("Error processing Deepgram response");
          addLogMessage("Error processing Deepgram response: " + error.message); // Añadir al log
        }
      };

      deepgramSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setDebug("WebSocket error");
        addLogMessage("WebSocket error: " + error.message); // Añadir al log
      };

      deepgramSocket.onclose = () => {
        console.log("WebSocket connection closed");
        addLogMessage("WebSocket connection closed"); // Añadir al log
      };

      mediaRecorder.ondataavailable = (event) => {
        if (
          event.data.size > 0 &&
          deepgramSocket.readyState === WebSocket.OPEN
        ) {
          deepgramSocket.send(event.data);
        }
      };
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setDebug("Error accessing microphone");
      addLogMessage("Error accessing microphone: " + error.message); // Añadir al log
    }
  }

  // Unificar el flujo de procesamiento para Final User Transcript
  const processFinalUserTranscript = async (transcript: string) => {
    console.log("Processing transcript:", transcript);
    addLogMessage("Processing transcript: " + transcript); // Añadir al log
    const startTime = performance.now(); // Start timer

    // Verificar usando avatarState.current
    if (avatarState.current === "avatar_start_talking" && transcript.trim() !== "") {
      console.log(
        "Avatar is talking and final user transcript received. Interrupting..."
      );
      addLogMessage(
        "Avatar is talking and final user transcript received. Interrupting..."
      ); // Añadir al log

      // Simular un clic en el botón de interrumpir
      if (interruptButtonRef.current) {
        interruptButtonRef.current.click();
      }
    } else {
      console.log("Avatar is not talking or transcript is empty. No action taken.");
      addLogMessage("Avatar is not talking or transcript is empty. No action taken."); // Añadir al log
    }

    // Solo proceder si el transcripto no está vacío
    if (transcript.trim() === "") {
      console.log("Empty transcript, not sending to OpenAI.");
      addLogMessage("Empty transcript, not sending to OpenAI."); // Añadir al log
      return;
    }

    try {
      // Add the user's message to the conversation history
      conversationHistory.current.push({ role: "user", content: transcript });

      // Ensure only the last 10 messages are kept in the history
      if (conversationHistory.current.length > 60) {
        conversationHistory.current.shift();
      }

      // Llamada a la API de OpenAI usando chat.completions
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini-2024-07-18",
        messages: [
          { role: "system", content: "Eres Nanci bot un sommelier virtual, asesora al cliente y responde de manera muy amigable y breve ya que estas en una videollamada, manten fluida la conversacion haciendo preguntas al usuario para conocer que le gusta más y sus preferencias, (no respondas con simbolos ni emoticones, tampoco enumeres estas en una llamada)." },
          ...conversationHistory.current // Include conversation history
        ],
      });

      const responseText =
        response.choices[0]?.message?.content || "No response";
      const endTime = performance.now(); // End timer
      const duration = endTime - startTime;

      console.log("OpenAI response:", responseText);
      addLogMessage("OpenAI response: " + responseText); // Añadir al log
      console.log(`Request duration: ${duration.toFixed(2)} ms`);
      addLogMessage(`Request duration: ${duration.toFixed(2)} ms`); // Añadir al log

      // Add the assistant's response to the conversation history
      conversationHistory.current.push({ role: "assistant", content: responseText });

      // Ensure only the last 10 messages are kept in the history
      if (conversationHistory.current.length > 20) {
        conversationHistory.current.shift();
      }

      // Actualizar el texto dinámico con el valor recibido de OpenAI
      setDynamicText(responseText);
    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      addLogMessage("Error calling OpenAI API: " + error.message); // Añadir al log
    }
  };

  function stopTranscription() {
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
        setDebug("Playing");
      };
    } else {
      console.warn("Stream or mediaStream not set");
      addLogMessage("Stream or mediaStream not set"); // Añadir al log
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
        backgroundImage:
          'url("https://forevertalents.com/wp-content/uploads/2024/07/nanci-bot-background.jpg")',
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
            <>
              <Button
                size="md"
                onClick={startSession}
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white"
                variant="shadow"
              >
                Iniciar sesión
              </Button>
              <div
                className="bg-white p-2 mt-4 rounded-lg"
                style={{
                  height: "200px",
                  width: "80%",
                  overflowY: "scroll",
                  border: "1px solid #ccc",
                }}
              >
                {logMessages.map((message, index) => (
                  <div key={index} style={{ fontSize: "0.9rem" }}>
                    {message}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Spinner size="lg" color="default" />
          )}
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
