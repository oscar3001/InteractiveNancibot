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
import { useEffect, useRef, useState, useReducer } from "react";
import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";

const DEFAULT_AVATAR_ID = "676a3ab0273440418ceb007502ab372c"; // Reemplaza con el ID por defecto
const DEFAULT_VOICE_ID = "3bb986b8c5c44f91a1c9b9cdb65f99b6"; // Reemplaza con el ID por defecto
const BACKGROUND_IMAGE_URL = "https://forevertalents.com/wp-content/uploads/2024/07/nanci-bot-background.jpg"; // Reemplaza con la URL de tu imagen

const initialState = {
  isLoadingSession: false,
  isLoadingRepeat: false,
  isLoadingChat: false,
  stream: undefined,
  debug: "",
  data: undefined,
  text: "",
  initialized: false,
  recording: false,
  shouldSubmit: false,
  input: "",
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_LOADING_SESSION":
      return { ...state, isLoadingSession: action.payload };
    case "SET_LOADING_REPEAT":
      return { ...state, isLoadingRepeat: action.payload };
    case "SET_LOADING_CHAT":
      return { ...state, isLoadingChat: action.payload };
    case "SET_STREAM":
      return { ...state, stream: action.payload };
    case "SET_DEBUG":
      return { ...state, debug: action.payload };
    case "SET_DATA":
      return { ...state, data: action.payload };
    case "SET_TEXT":
      return { ...state, text: action.payload };
    case "SET_INITIALIZED":
      return { ...state, initialized: action.payload };
    case "SET_RECORDING":
      return { ...state, recording: action.payload };
    case "SET_SHOULD_SUBMIT":
      return { ...state, shouldSubmit: action.payload };
    case "SET_INPUT":
      return { ...state, input: action.payload };
    default:
      return state;
  }
}

export default function InteractiveAvatar() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const interruptButtonRef = useRef<HTMLButtonElement>(null); // Referencia para el botón "Interrumpir Habla"

  const { input, handleSubmit } = useChat({
    onFinish: async (message) => {
      console.log("ChatGPT Response:", message);

      if (!state.initialized || !avatar.current) {
        dispatch({ type: "SET_DEBUG", payload: "Avatar API not initialized" });
        return;
      }

      await avatar.current
        .speak({
          taskRequest: { text: message.content, sessionId: state.data?.sessionId },
        })
        .catch((e) => {
          dispatch({ type: "SET_DEBUG", payload: e.message });
        });
      dispatch({ type: "SET_LOADING_CHAT", payload: false });
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
    if (state.shouldSubmit) {
      console.log("Conditions met, submitting...");
      dispatch({ type: "SET_LOADING_CHAT", payload: true });
      if (!state.input) {
        dispatch({ type: "SET_DEBUG", payload: "Ingrese el mensaje a enviar" });
        return;
      }
      handleSubmit();
      dispatch({ type: "SET_SHOULD_SUBMIT", payload: false }); // Reset the flag
    }
  }, [state.shouldSubmit, state.input, handleSubmit]);

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
    dispatch({ type: "SET_LOADING_SESSION", payload: true });
    await updateToken();
    if (!avatar.current) {
      dispatch({ type: "SET_DEBUG", payload: "Avatar API is not initialized" });
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
      dispatch({ type: "SET_DATA", payload: res });
      dispatch({ type: "SET_STREAM", payload: avatar.current.mediaStream });
      startRecording(); // Iniciar la grabación al iniciar la sesión
    } catch (error) {
      console.error("Error starting avatar session:", error);
      dispatch({ type: "SET_DEBUG", payload: `There was an error starting the session. ${DEFAULT_VOICE_ID ? "This custom voice ID may not be supported." : ""}` });
    }
    dispatch({ type: "SET_LOADING_SESSION", payload: false });
  }

  async function updateToken() {
    const newToken = await fetchAccessToken();
    console.log("Updating Access Token:", newToken); // Log token for debugging
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    const startTalkCallback = (e: any) => {
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

    // Initialize avatar state as stopped by default
    localStorage.setItem("avatarState", "stopped");

    dispatch({ type: "SET_INITIALIZED", payload: true });
  }

  async function handleInterrupt() {
    if (!state.initialized || !avatar.current) {
      dispatch({ type: "SET_DEBUG", payload: "Avatar API not initialized" });
      return;
    }
    await avatar.current
      .interrupt({ interruptRequest: { sessionId: state.data?.sessionId } })
      .catch((e) => {
        dispatch({ type: "SET_DEBUG", payload: e.message });
      });
  }

  async function endSession() {
    if (!state.initialized || !avatar.current) {
      dispatch({ type: "SET_DEBUG", payload: "Avatar API not initialized" });
      return;
    }
    await avatar.current.stopAvatar(
      { stopSessionRequest: { sessionId: state.data?.sessionId } },
      setDebug
    );
    dispatch({ type: "SET_STREAM", payload: undefined });
  }

  async function handleSpeak() {
    dispatch({ type: "SET_LOADING_REPEAT", payload: true });
    if (!state.initialized || !avatar.current) {
      dispatch({ type: "SET_DEBUG", payload: "Avatar API not initialized" });
      return;
    }
    await avatar.current
      .speak({ taskRequest: { text: state.text, sessionId: state.data?.sessionId } })
      .catch((e) => {
        dispatch({ type: "SET_DEBUG", payload: e.message });
      });
    dispatch({ type: "SET_LOADING_REPEAT", payload: false });
  }

  useEffect(() => {
    async function init() {
      const newToken = await fetchAccessToken();
      console.log("Initializing with Access Token:", newToken); // Log token for debugging
      avatar.current = new StreamingAvatarApi(
        new Configuration({ accessToken: newToken, jitterBuffer: 60 })
      );
      dispatch({ type: "SET_INITIALIZED", payload: true });
    }
    init();

    return () => {
      endSession();
    };
  }, []);

  useEffect(() => {
    if (state.stream && mediaStream.current) {
      mediaStream.current.srcObject = state.stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        dispatch({ type: "SET_DEBUG", payload: "Playing" });
      };
    }
  }, [state.stream]);

  function startRecording() {
    const deepgramApiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
    const deepgram = createClient(deepgramApiKey);
    let emptyTranscriptionCount = 0;

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
            dispatch({ type: "SET_RECORDING", payload: false });
          };
          mediaRecorder.current!.start(40);
          dispatch({ type: "SET_RECORDING", payload: true });
        });

        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          const newTranscription = data.channel.alternatives[0].transcript;
          console.log("Received transcription: ", newTranscription);

          // Concatenate transcription
          dispatch({ type: "SET_INPUT", payload: (prevInput) => {
            const updatedInput = prevInput + "" + newTranscription;
            console.log("Updated input: ", updatedInput);

            // Check conditions for handleSubmit
            if (checkForText(updatedInput)) {
              console.log("First condition met: Input contains text.");
              if (checkForConsecutiveEmpty(newTranscription)) {
                console.log("Second condition met: consecutive empty transcriptions.");
                dispatch({ type: "SET_SHOULD_SUBMIT", payload: true }); // Trigger the useEffect to handle submit
              }
            }

            const avatarState = localStorage.getItem("avatarState");
            if (checkForText(updatedInput)) {
              if (avatarState === "started") {
                console.log("Detecte audio mientras habla el avatar");
                //AQUI QUIERO PRESIONAR EL BOTON AUTOMATICAMENTE "INTERRUMPIR HABLA"
                if (interruptButtonRef.current) {
                  interruptButtonRef.current.click();
                }
              } else if (avatarState === "stopped") {
                console.log("Detecte audio mientras habla el avatar estaba en silencio");
              }
            }

            return updatedInput;
          }});
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
      dispatch({ type: "SET_RECORDING", payload: false });
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

  // Function to check for consecutive empty transcriptions
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
          {state.stream ? (
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
                  ref={interruptButtonRef} // Añadir referencia aquí
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
          ) : !state.isLoadingSession ? (
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
              placeholder="Inggrese mensaje que se va a repetir"
              input={state.text}
              onSubmit={handleSpeak}
              setInput={(input) => dispatch({ type: "SET_TEXT", payload: input })}
              disabled={!state.stream}
              loading={state.isLoadingRepeat}
            />
          </div>
          <div className="hidden">
            <InteractiveAvatarTextInput
              label="Chat"
              placeholder="Escribe mensaje al avatar"
              input={state.input}
              onSubmit={() => {
                dispatch({ type: "SET_LOADING_CHAT", payload: true });
                if (!state.input) {
                  dispatch({ type: "SET_DEBUG", payload: "Escribe mensaje al avatar" });
                  return;
                }
                handleSubmit();
              }}
              setInput={(input) => dispatch({ type: "SET_INPUT", payload: input })}
              loading={state.isLoadingChat}
              endContent={
                <Tooltip
                  content={!state.recording ? "Inicio Escucha" : "Detener Escucha"}
                >
                  <Button
                    onClick={!state.recording ? startRecording : stopRecording}
                    isDisabled={!state.stream}
                    isIconOnly
                    className={clsx(
                      "mr-4 text-white",
                      !state.recording
                        ? "bg-gradient-to-tr from-indigo-500 to-indigo-300"
                        : ""
                    )}
                    size="sm"
                    variant="shadow"
                  >
                    {!state.recording ? (
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
              disabled={!state.stream}
            />
          </div>
        </CardFooter>
      </Card>
      <p className="font-mono text-right hidden">
        <span className="font-bold">Console:</span>
        <br />
        {state.debug}
      </p>
    </div>
  );
}
