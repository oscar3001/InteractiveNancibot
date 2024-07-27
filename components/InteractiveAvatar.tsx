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
  const [stream, setStream] = useState();
  const [debug, setDebug] = useState();
  const [data, setData] = useState();
  const [text, setText] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [recording, setRecording] = useState(false);
  const [shouldSubmit, setShouldSubmit] = useState(false);
  const mediaStream = useRef(null);
  const avatar = useRef(null);
  const mediaRecorder = useRef(null);
  const { input, setInput, handleSubmit } = useChat({
    onFinish: async (message) => {
      console.log("ChatGPT Response:", message);

      if (!initialized || !avatar.current) {
        setDebug("Avatar API not initialized");
        return;
      }

      await avatar.current
        .speak({ taskRequest: { text: message.content, sessionId: data?.sessionId } })
        .catch((e) => {
          setDebug(e.message);
        });
      setIsLoadingChat(false);
    },
    initialMessages: [
      {
        id: "1",
        role: "system",
        content: "eres Nancibot, un avatar sommelier experto en vinos y recomendaciones, responderas de manera muy breve y amigable al usuario. Estas en una videollamada, pero no puedes realizar ninguna accion solo responder preguntas. Hazle preguntas al usuario para conocer sus gustos y mantener la conversación fluida.",
      },
    ],
  });

  useEffect(() => {
    if (shouldSubmit) {
      console.log("Conditions met, submitting...");
      setIsLoadingChat(true);
      if (!input) {
        setDebug("Ingrese el mensaje a enviar");
        return;
      }
      handleSubmit();
      setShouldSubmit(false);  // Reset the flag
    }
  }, [shouldSubmit, input, handleSubmit, setDebug, setIsLoadingChat]);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token);  // Log the token to verify
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
      const res = await avatar.current.createStartAvatar({
        newSessionRequest: {
          quality: "low",
          avatarName: DEFAULT_AVATAR_ID,
          voice: { voiceId: DEFAULT_VOICE_ID },
        },
      }, setDebug);
      setData(res);
      setStream(avatar.current.mediaStream);
      startRecording();  // Iniciar la grabación al iniciar la sesión
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
    console.log("Updating Access Token:", newToken);  // Log token for debugging
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    const startTalkCallback = (e: any) => {
      console.log("Avatar started talking", e);
    };

    const stopTalkCallback = (e: any) => {
      console.log("Avatar stopped talking", e);
    };

    console.log("Adding event handlers:", avatar.current);
    avatar.current.addEventHandler("avatar_start_talking", startTalkCallback);
    avatar.current.addEventHandler("avatar_stop_talking", stopTalkCallback);

    setInitialized(true);
  }

  async function handleInterrupt() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    await avatar.current
      .interrupt({ interruptRequest: { sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
  }

  async function endSession() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    await avatar.current.stopAvatar(
      { stopSessionRequest: { sessionId: data?.sessionId } },
      setDebug
    );
    setStream(undefined);
  }

  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    await avatar.current
      .speak({ taskRequest: { text: text, sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
    setIsLoadingRepeat(false);
  }

  useEffect(() => {
    async function init() {
      const newToken = await fetchAccessToken();
      console.log("Initializing with Access Token:", newToken);  // Log token for debugging
      avatar.current = new StreamingAvatarApi(
        new Configuration({ accessToken: newToken, jitterBuffer: 200 })
      );
      setInitialized(true);  // Set initialized to true
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
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

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
          };
          mediaRecorder.current!.onstop = () => {
            connection.finish();
            console.log("Deepgram connection closed.");
            setRecording(false);
          };
          mediaRecorder.current!.start(100);
          setRecording(true);
        });

        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          const newTranscription = data.channel.alternatives[0].transcript;
          console.log("Received transcription: ", newTranscription);

          setInput((prevInput) => {
            const updatedInput = prevInput + " " + newTranscription;
            console.log("Updated input: ", updatedInput);

            if (checkForText(updatedInput)) {
              console.log("First condition met: Input contains text.");
              if (silenceTimer) {
                clearTimeout(silenceTimer);
              }
              silenceTimer = setTimeout(() => {
                setShouldSubmit(true);  // Trigger the useEffect to handle submit
              }, 3000);  // 3 seconds
            }

            return updatedInput;
          });
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

  function checkForText(input: string) {
    const regex = /\S/;
    const result = regex.test(input);
    console.log("Checking for text in input: ", input, " Result: ", result);
    return result;
  }

  return (
    <>
      {stream ? (
        <>
          <Button onClick={handleInterrupt}>Interrumpir Habla</Button>
          <Button onClick={endSession}>Colgar</Button>
        </>
      ) : !isLoadingSession ? (
        <Button onClick={startSession}>Llamar a Nancy Bot</Button>
      ) : (
        <Spinner />
      )}

      {/* Other UI components */}

      <InteractiveAvatarTextInput
        onSendMessage={() => {
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
          <>
            {!recording ? (
              <Microphone onClick={startRecording} />
            ) : (
              <MicrophoneStage onClick={stopRecording} />
            )}
          </>
        }
        disabled={!stream}
      />

      <div>Console: {debug}</div>
    </>
  );
}
