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
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const avatarId = "e4c17778854d498fbaf942dc6b7079c4";
  const voiceId = "56dbe24c7bfb4fc0b4939c5663733855";
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

      // Inicializa mediaRecorder sin mimeType
      const mediaRecorder = new MediaRecorder(audioStream);

      const deepgramSocket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?vad_events=${deepgramOptions.vad_events}&interim_results=${deepgramOptions.interim_results}&endpointing=${deepgramOptions.endpointing}&utterance_end_ms=${deepgramOptions.utterance_end_ms}&language=${deepgramOptions.language}&model=${deepgramOptions.model}`,
        ["token", deepgramApiKey]
      );

      deepgramSocket.onopen = () => {
        console.log("WebSocket connection opened to Deepgram");
        mediaRecorder.start(150); // Start recording with 250ms buffer size
      };

      deepgramSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Deepgram response:", data);

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

            if (
              transcript.trim() !== "" && // Verificar que el transcripto no esté vacío
              avatarState.current === "avatar_start_talking" &&
              !hasInterrupted.current
            ) {
              console.log(
                "Avatar is talking and partial transcript received. Interrupting..."
              );
              if (interruptButtonRef.current) {
                interruptButtonRef.current.click();
              }
            }

            if (isFinal) {
              if (transcript.trim() !== "") {
                userDiceRef.current += transcript + " ";
                console.log("Current user_dice:", userDiceRef.current);
              }

              if (!speechFinal) {
                timerRef.current = setTimeout(() => {
                  if (isFinal && !speechFinal && userDiceRef.current.trim() !== "") {
                    console.log(
                      "Forced Final User Transcript:",
                      userDiceRef.current
                    );
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
              }
            }
          } else {
            console.log("Received unexpected message type:", data.type);
          }
        } catch (error) {
          console.error("Error processing Deepgram response:", error);
          setDebug("Error processing Deepgram response");
        }
      };

      deepgramSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setDebug("WebSocket error");
      };

      deepgramSocket.onclose = () => {
        console.log("WebSocket connection closed");
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
    }
  }

  // Unificar el flujo de procesamiento para Final User Transcript
  const processFinalUserTranscript = async (transcript: string) => {
    console.log("Processing transcript:", transcript);
    const startTime = performance.now(); // Start timer

    // Verificar usando avatarState.current
    if (avatarState.current === "avatar_start_talking" && transcript.trim() !== "") {
      console.log(
        "Avatar is talking and final user transcript received. Interrupting..."
      );

      // Simular un clic en el botón de interrumpir
      if (interruptButtonRef.current) {
        interruptButtonRef.current.click();
      }
    } else {
      console.log("Avatar is not talking or transcript is empty. No action taken.");
    }

    // Solo proceder si el transcripto no está vacío
    if (transcript.trim() === "") {
      console.log("Empty transcript, not sending to OpenAI.");
      return;
    }

    try {
      // Add the user's message to the conversation history
      conversationHistory.current.push({ role: "user", content: transcript });

      // Ensure only the last 10 messages are kept in the history
      if (conversationHistory.current.length > 20) {
        conversationHistory.current.shift();
      }

      // Llamada a la API de OpenAI usando chat.completions
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini-2024-07-18",
        messages: [
          { role: "system", content: "Eres Zaira Bot un asistente virtual que trabaja para abilitytohelp.\nEstas en una llamada de voz y tu tarea principal es responder preguntas de padres de familia y otros interesados de manera amigable, brindando información clara sobre el autismo, nuestros servicios o carreras.\nla conversacion que tienes con el usuario es una llamada en tiempo real por lo que tienes que responder de forma muy profesional y amigable Manteniendo la conversación fluida preguntándole más cosas al usuario para poder obtener mas informacion, entender mejor su situacion y poder ayudarlo mejor en todas las dudas que tenga sobre el autismo o nuestros servicios. solo usaras informacion del libro si te lo preguntan.\nDescripción: Somos una organización sin fines de lucro dedicada a ofrecer análisis de comportamiento aplicado (ABA) y técnicas de gestión en el hogar para niños con autismo, Hemos servido al sur de Florida desde 2009.\n\nServicios Ofrecidos que ofrece Ability to Help:\n- Intervención en Autismo\n- Retraso del Habla\n- Comunicación Alternativa\n- Entrenamiento para el Uso del Baño\n- Apoyo Escolar\n- Déficit de Atención\n- Tutoría Académica\n- Alimentación Selectiva\n- Reducción de Comportamientos\n- Disrupción del Sueño\n- Desarrollo de Habilidades Sociales\n- Cuidado de Respiro\n\nCarreras Profesionales que ofrece abilitytohelp:\n- ABA Therapist: Trabaja uno a uno con niños en un ambiente flexible con beneficios y oportunidades de reubicación.\n- BCaBA: Analista de Comportamiento Certificado, responsabilidades avanzadas, medio tiempo. Requiere certificación en RCP y antecedentes limpios.\nInformación Adicional\n- Voluntariado y Donaciones: Aceptamos voluntarios y donaciones. Puede contactarnos para más información sobre cómo involucrarse.\nNotas Importantes:\n- Mantener la conversacion fluida preguntandole cosas al usuario para obtener mas informacion con un tono amigable.\n- Escuchar atentamente las necesidades y preocupaciones de los padres.\n- Brindar respuestas claras y concisas" },
          ...conversationHistory.current // Include conversation history
        ],
      });

      const responseText =
        response.choices[0]?.message?.content || "No response";
      const endTime = performance.now(); // End timer
      const duration = endTime - startTime;

      console.log("OpenAI response:", responseText);
      console.log(`Request duration: ${duration.toFixed(2)} ms`);

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
        new Configuration({ accessToken: newToken, jitterBuffer: 150 })
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
          'url("https://forevertalents.com/wp-content/uploads/2024/08/zaira-bot-background.jpg")',
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
