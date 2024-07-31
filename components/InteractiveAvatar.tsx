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
  const interruptButtonRef = useRef<HTMLButtonElement>(null);
  const { input, setInput, handleSubmit } = useChat({
    onFinish: async (message) => {
      console.log("ChatGPT Response received:", message);

      if (!initialized || !avatar.current) {
        setDebug("Avatar API not initialized");
        return;
      }

      console.time("OpenAI to Avatar Start Talking");
      await avatar.current
        .speak({
          taskRequest: { text: message.content, sessionId: data?.sessionId },
        })
        .catch((e) => {
          setDebug(e.message);
        });
      console.timeEnd("OpenAI to Avatar Start Talking");

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
    if (shouldSubmit && input.trim() !== "") {
      console.time("Handle Submit Start");
      setIsLoadingChat(true);
      handleSubmit();
      setShouldSubmit(false);
      console.timeEnd("Handle Submit Start");
    }
  }, [shouldSubmit, input, handleSubmit]);

  async function fetchAccessToken() {
    console.time("Fetch Access Token Start");
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token received:", token);
      console.timeEnd("Fetch Access Token Start");
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      console.timeEnd("Fetch Access Token Start");
      return "";
    }
  }

  async function startSession() {
    console.log("Starting session...");
    setIsLoadingSession(true);
    console.time("Update Token Start");
    await updateToken();
    console.timeEnd("Update Token Start");

    if (!avatar.current) {
      setDebug("Avatar API is not initialized");
      return;
    }
    try {
      console.time("Create Start Avatar Start");
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
      console.timeEnd("Create Start Avatar Start");
      setData(res);
      setStream(avatar.current.mediaStream);
      startRecording();
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug(
        `There was an error starting the session. ${DEFAULT_VOICE_ID ? "This custom voice ID may not be supported." : ""}`
      );
    }
    setIsLoadingSession(false);
  }

  async function updateToken() {
    const newToken = await fetchAccessToken();
    console.log("Updating Access Token:", newToken);
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    const startTalkCallback = (e: any) => {
      console.timeEnd("OpenAI to Avatar Start Talking");
      console.log("Avatar started talking", e);
      localStorage.setItem("avatarState", "started");
    };

    const stopTalkCallback = (e: any) => {
      console.log("Avatar stopped talking", e);
      localStorage.setItem("avatarState", "stopped");
    };

    console.log("Adding event handlers:", avatar.current);
    avatar.current.addEventHandler("avatar_start_talking", startTalkCallback);
    avatar.current.addEventHandler("avatar_stop_talking", stopTalkCallback);

    localStorage.setItem("avatarState", "stopped");

    setInitialized(true);
  }

  async function handleInterrupt() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    console.time("Interrupt Avatar Start");
    await avatar.current
      .interrupt({ interruptRequest: { sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
    console.timeEnd("Interrupt Avatar Start");
  }

  async function endSession() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    console.time("Stop Avatar Start");
    await avatar.current.stopAvatar(
      { stopSessionRequest: { sessionId: data?.sessionId } },
      setDebug
    );
    console.timeEnd("Stop Avatar Start");
    setStream(undefined);
  }

  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    console.time("Avatar Speak Repeat Start");
    await avatar.current
      .speak({ taskRequest: { text: text, sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
    console.timeEnd("Avatar Speak Repeat Start");
    setIsLoadingRepeat(false);
  }

  useEffect(() => {
    async function init() {
      console.time("Init Fetch Access Token Start");
      const newToken = await fetchAccessToken();
      console.log("Initializing with Access Token:", newToken);
      avatar.current = new StreamingAvatarApi(
        new Configuration({ accessToken: newToken, jitterBuffer: 60 })
      );
      setInitialized(true);
      console.timeEnd("Init Fetch Access Token Start");
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
      };
    }
  }, [mediaStream, stream]);

  function startRecording() {
    const deepgramApiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
    const deepgram = createClient(deepgramApiKey);

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaRecorder.current = new MediaRecorder(stream);
        const connection = deepgram.listen.live({
          punctuate: true,
          model: 'nova-2',
          language: 'es',
          interim_results: true,
          utterance_end_ms: 1000
        });

        connection.on(LiveTranscriptionEvents.Open, () => {
          mediaRecorder.current!.ondataavailable = (event) => {
            connection.send(event.data);
          };
          mediaRecorder.current!.onstop = () => {
            connection.finish();
            setRecording(false);
          };
          mediaRecorder.current!.start(40);
          setRecording(true);
        });

        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          const newTranscription = data.channel.alternatives[0].transcript;
          console.log("New Transcription:", newTranscription);
          setInput((prevInput) => {
            const updatedInput = prevInput + "" + newTranscription;

            if (updatedInput.trim() !== "") {
              setShouldSubmit(false);
            }

            const avatarState = localStorage.getItem("avatarState");
            if (updatedInput.trim() !== "" && avatarState === "started") {
              if (interruptButtonRef.current) {
                setTimeout(() => {
                  interruptButtonRef.current?.click();
                }, 0);
              }
            }
            return updatedInput;
          });
        });

        connection.on('UtteranceEnd', (data) => {
          console.log("Utterance End detected");
          console.time("OpenAI to Avatar Start Talking");
          setShouldSubmit(true);
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
    }
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
                  ref={interruptButtonRef}
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
                Llamar a Nanci Bot
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
              placeholder="Ingrese mensaje que se va a repetir"
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
