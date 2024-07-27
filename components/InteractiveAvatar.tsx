import { AVATARS, VOICES } from "@/app/lib/constants";
import {
  Configuration,
  NewSessionData,
  StreamingAvatarApi,
} from "@heygen/streaming-avatar";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Divider,
  Spinner,
  Tooltip,
} from "@nextui-org/react";
import { Microphone, MicrophoneStage } from "@phosphor-icons/react";
import { useChat } from "ai/react";
import clsx from "clsx";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { useEffect, useRef, useState } from "react";
import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";

const DEFAULT_AVATAR_ID = "676a3ab0273440418ceb007502ab372c";
const DEFAULT_VOICE_ID = "3bb986b8c5c44f91a1c9b9cdb65f99b6";
const BACKGROUND_IMAGE_URL = "https://forevertalents.com/wp-content/uploads/2024/07/nanci-bot-background.jpg";

export default function InteractiveAvatar() {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>();
  const [data, setData] = useState<NewSessionData>();
  const [text, setText] = useState<string>("");
  const [initialized, setInitialized] = useState(false);
  const [recording, setRecording] = useState(false);
  const [shouldSubmit, setShouldSubmit] = useState(false);
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const { input, setInput, handleSubmit } = useChat({
    onFinish: async (message) => {
      console.log("ChatGPT Response:", message);

      if (!initialized || !avatar.current) {
        setDebug("Avatar API not initialized");
        return;
      }

      console.log("Avatar speaking:", message.content);

      await avatar.current
        .speak({
          taskRequest: { text: message.content, sessionId: data?.sessionId },
        })
        .catch((e) => {
          setDebug(e.message);
        });
      setIsLoadingChat(false);
    },
    initialMessages: [
      {
        id: "1",
        role: "system",
        content: "eres Nancibot un avatar sommelier experto en vinos y recomendaciones, responderas de manera muy breve y amigable al usuario estas en una videollamada, pero no puedes realizar ninguna accion solo responder preguntas. asle preguntas al usuario para conocer sus gustos y mantener la conversacion fluida.",
      },
    ],
  });

  useEffect(() => {
    if (shouldSubmit) {
      console.log("Conditions met, submitting...");
      setIsLoadingChat(true);
      if (!input) {
        setDebug("ingrese el mensaje a enviar");
        return;
      }
      handleSubmit();
      setShouldSubmit(false); // Reset the flag
    }
  }, [shouldSubmit, input, handleSubmit, setDebug, setIsLoadingChat]);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token); // Log the token to verify
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      return "";
    }
  }

  async function startSession() {
    console.log("Starting session...");
    setIsLoadingSession(true);
    await updateToken();
    if (!avatar.current) {
      setDebug("Avatar API is not initialized");
      console.log("Avatar API is not initialized");
      return;
    }
    try {
      const res = await avatar.current.createStartAvatar(
        {
          newSessionRequest: {
            quality: "low",
            avatarName: DEFAULT_AVATAR_ID,
            voice: { voiceId: DEFAULT_VOICE_ID },
          },
        },
        setDebug
      );
      console.log("Session started:", res);
      setData(res);
      setStream(avatar.current.mediaStream);
      startRecording(); // Iniciar la grabación al iniciar la sesión
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug(
        `There was an error starting the session. ${DEFAULT_VOICE_ID ? "This custom voice ID may not be supported." : ""}`
      );
    }
    setIsLoadingSession(false);
  }

  async function updateToken() {
    console.log("Updating access token...");
    const newToken = await fetchAccessToken();
    console.log("New access token:", newToken);
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    avatar.current.addEventHandler("avatar_start_talking", (e: any) => {
      console.log("Avatar started talking", e);
    });

    avatar.current.addEventHandler("avatar_stop_talking", (e: any) => {
      console.log("Avatar stopped talking", e);
    });

    setInitialized(true);
    console.log("Avatar API initialized");
  }

  async function handleInterrupt() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      console.log("Avatar API not initialized");
      return;
    }
    await avatar.current
      .interrupt({ interruptRequest: { sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
        console.error("Error interrupting:", e);
      });
  }

  async function endSession() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      console.log("Avatar API not initialized");
      return;
    }
    await avatar.current.stopAvatar(
      { stopSessionRequest: { sessionId: data?.sessionId } },
      setDebug
    );
    setStream(undefined);
    console.log("Session ended");
  }

  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      console.log("Avatar API not initialized");
      setIsLoadingRepeat(false);
      return;
    }
    await avatar.current
      .speak({ taskRequest: { text: text, sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
        console.error("Error in handleSpeak:", e);
      });
    setIsLoadingRepeat(false);
    console.log("Avatar speaking:", text);
  }

  useEffect(() => {
    async function init() {
      const newToken = await fetchAccessToken();
      console.log("Initializing with Access Token:", newToken);
      avatar.current = new StreamingAvatarApi(
        new Configuration({ accessToken: newToken, jitterBuffer: 200 })
      );
      setInitialized(true);
      console.log("Avatar API initialized on mount");
    }
    init();

    return () => {
      endSession();
    };
  }, []);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
        console.log("Media stream playing");
      };
    }
  }, [mediaStream, stream]);

  function startRecording() {
    console.log("Starting recording...");
    const deepgramApiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
    const deepgram = createClient(deepgramApiKey);
    let lastTranscriptionTime = 0;
    const silenceThreshold = 2; // threshold in seconds

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaRecorder.current = new MediaRecorder(stream);
        const connection = deepgram.listen.live({
          punctuate: true,
          model: 'nova-2',
          language: 'es',
        });

        connection.on(LiveTranscriptionEvents.Open, () => {
          console.log("Deepgram connection opened.");
          mediaRecorder.current!.ondataavailable = (event) => {
            connection.send(event.data);
            console.log("Sending audio data to Deepgram");
          };
          mediaRecorder.current!.onstop = () => {
            connection.finish();
            console.log("Deepgram connection closed.");
            setRecording(false);
          };
          mediaRecorder.current!.start(100);
          setRecording(true);
          console.log("Recording started");
        });

        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          const newTranscription = data.channel.alternatives[0].transcript;
          const currentTime = Date.now() / 1000;

          console.log("Received transcription: ", newTranscription);

          if (newTranscription.trim()) {
            lastTranscriptionTime = currentTime;
            setInput((prevInput) => {
              const updatedInput = `${prevInput} ${newTranscription}`;
              console.log("Updated input: ", updatedInput);

              // Check conditions for handleSubmit
              if (checkForText(updatedInput)) {
                console.log("First condition met: Input contains text.");
                if (checkForConsecutiveEmpty(newTranscription)) {
                  console.log("Second condition met: Two consecutive empty transcriptions.");
                  setShouldSubmit(true); // Trigger the useEffect to handle submit
                }
              }

              return updatedInput;
            });
          } else if (currentTime - lastTranscriptionTime > silenceThreshold) {
            console.log("Silence threshold met, submitting...");
            setShouldSubmit(true);
            lastTranscriptionTime = currentTime;
          }
        });

        connection.on(LiveTranscriptionEvents.Error, (error) => {
          console.error("Deepgram error: ", error);
        });
      })
      .catch((error) => {
        console.error("Error accessing microphone:", error);
      });
  }

  function stopRecording() {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      setRecording(false);
      console.log("Recording stopped");
    }
  }

  // Function to check if input contains any text or numbers
  function checkForText(input) {
    const regex = /\S/;
    const result = regex.test(input);
    console.log("Checking for text in input: ", input, " Result: ", result);
    return result;
  }

  // Variable to keep track of consecutive empty transcriptions
  let emptyCount = 0;

  // Function to check for two consecutive empty transcriptions
  function checkForConsecutiveEmpty(newTranscription) {
    if (newTranscription.trim() === "") {
      emptyCount++;
      console.log("Empty transcription received. Empty count: ", emptyCount);
      if (emptyCount >= 1) {
        emptyCount = 0;  // reset counter
        return true;
      }
    } else {
      emptyCount = 0;  // reset counter
    }
    return false;
  }

  return (
    <div className="w-full h-screen flex flex-col gap-4">
      <Card className="w-full h-full">
        <CardBody className="w-full h-full flex flex-col justify-center items-center">
          {stream ? (
            <div className="w-full h-full flex justify-center items-center relative">
              <video
                ref={mediaStream}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              >
                <track kind="captions" />
              </video>
              <div className="flex flex-col gap-2 absolute bottom-3 right-3">
                <Button
                  size="md"
                  onClick={handleInterrupt}
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
                  variant="shadow"
                >
                  Interrumpir Habla
                </Button>
                <Button
                  size="md"
                  onClick={endSession}
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
                  variant="shadow"
                >
                  Colgar
                </Button>
              </div>
            </div>
          ) : !isLoadingSession ? (
            <div
              className="w-full h-full flex justify-center items-center flex-col gap-8"
              style={{
                backgroundImage: `url(${BACKGROUND_IMAGE_URL})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <Button
                size="md"
                onClick={startSession}
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 w-1/2 text-white"
                variant="shadow"
              >
                Llamar a Nancy Bot
              </Button>
            </div>
          ) : (
            <Spinner size="lg" color="default" />
          )}
        </CardBody>
        <Divider />
        <CardFooter className="flex flex-col gap-3">
          <div className="hidden">
            <InteractiveAvatarTextInput
              label="Repeat"
              placeholder="Inggrese mensaje que se va a repetir"
              input={text}
              onSubmit={handleSpeak}
              setInput={setText}
              disabled={!stream}
              loading={isLoadingRepeat}
            />
          </div>
          <div className="hidden">
            <InteractiveAvatarTextInput
              label="Chat"
              placeholder="Escribe mensaje al avatar"
              input={input}
              onSubmit={() => {
                setIsLoadingChat(true);
                if (!input) {
                  setDebug("Escribe mensaje al avatar");
                  return;
                }
                handleSubmit();
              }}
              setInput={setInput}
              loading={isLoadingChat}
              endContent={
                <Tooltip
                  content={!recording ? "Inicio Escucha" : "Detener Escucha"}
                >
                  <Button
                    onClick={!recording ? startRecording : stopRecording}
                    isDisabled={!stream}
                    isIconOnly
                    className={clsx(
                      "mr-4 text-white",
                      !recording
                        ? "bg-gradient-to-tr from-indigo-500 to-indigo-300"
                        : ""
                    )}
                    size="sm"
                    variant="shadow"
                  >
                    {!recording ? (
                      <Microphone size={20} />
                    ) : (
                      <>
                        <div className="absolute h-full w-full bg-gradient-to-tr from-indigo-500 to-indigo-300 animate-pulse -z-10"></div>
                        <MicrophoneStage size={20} />
                      </>
                    )}
                  </Button>
                </Tooltip>
              }
              disabled={!stream}
            />
          </div>
        </CardFooter>
      </Card>
      <p className="font-mono text-right hidden">
        <span className="font-bold">Console:</span>
        <br />
        {debug}
      </p>
    </div>
  );
}
