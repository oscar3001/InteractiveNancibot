import { useState, useEffect, useRef } from "react";
import { Configuration, StreamingAvatarApi } from "@heygen/streaming-avatar";
import { Button } from "@nextui-org/react";

const DEFAULT_AVATAR_ID = "676a3ab0273440418ceb007502ab372c";
const DEFAULT_VOICE_ID = "3bb986b8c5c44f91a1c9b9cdb65f99b6";
const MESSAGE_INTERVAL = 10000; // Intervalo en milisegundos (10 segundos)

export default function InteractiveAvatar() {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [data, setData] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [avatarState, setAvatarState] = useState("stopped");
  const [lastMessageTime, setLastMessageTime] = useState(Date.now());
  const avatar = useRef(null);

  const messages = [
    "Este es el primer mensaje predeterminado.",
    "Aquí tienes el segundo mensaje predeterminado.",
    "Este es el tercer mensaje predeterminado.",
    "Este es el cuarto mensaje predeterminado.",
    "Y este es el quinto mensaje predeterminado."
  ];

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", { method: "POST" });
      const token = await response.text();
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      return "";
    }
  }

  async function updateToken() {
    const newToken = await fetchAccessToken();
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    const startTalkCallback = (e) => {
      console.log("Avatar started talking", e);
      setAvatarState("started");
    };

    const stopTalkCallback = (e) => {
      console.log("Avatar stopped talking", e);
      setAvatarState("stopped");
    };

    avatar.current.addEventHandler("avatar_start_talking", startTalkCallback);
    avatar.current.addEventHandler("avatar_stop_talking", stopTalkCallback);

    setInitialized(true);
  }

  function getRandomMessage() {
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
  }

  async function handleSpeak() {
    const currentTime = Date.now();
    if (avatarState !== "stopped" || (currentTime - lastMessageTime) < MESSAGE_INTERVAL) return;

    setIsLoadingRepeat(true);
    try {
      const message = getRandomMessage();
      await avatar.current.speak({
        taskRequest: { text: message, sessionId: data.sessionId },
      });
      setLastMessageTime(currentTime);
    } catch (e) {
      console.error(e);
    }
    setIsLoadingRepeat(false);
  }

  async function startSession() {
    setIsLoadingSession(true);
    await updateToken();

    try {
      const res = await avatar.current.createStartAvatar(
        {
          newSessionRequest: {
            quality: "low",
            avatarName: DEFAULT_AVATAR_ID,
            voice: { voiceId: DEFAULT_VOICE_ID },
          },
        }
      );
      setData(res);
    } catch (error) {
      console.error("Error starting avatar session:", error);
    }
    setIsLoadingSession(false);
  }

  useEffect(() => {
    async function init() {
      const newToken = await fetchAccessToken();
      avatar.current = new StreamingAvatarApi(
        new Configuration({ accessToken: newToken })
      );
      setInitialized(true);
    }
    init();
  }, []);

  useEffect(() => {
    if (avatarState === "stopped") {
      handleSpeak();
    }
  }, [avatarState]);

  return (
    <div className="w-full h-screen flex flex-col gap-4">
      <Button
        size="md"
        onClick={startSession}
        className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white"
        variant="shadow"
        disabled={isLoadingSession}
      >
        Llamar a Nanci Bot
      </Button>
      {isLoadingRepeat && <p>Enviando mensaje...</p>}
    </div>
  );
}
