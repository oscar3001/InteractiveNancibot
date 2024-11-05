import type { StartAvatarResponse } from "@heygen/streaming-avatar";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  VoiceEmotion,
} from "@heygen/streaming-avatar";
import { useEffect, useRef, useState } from "react";
import { FaPhone, FaPhoneSlash, FaSpinner } from "react-icons/fa";
import { IconContext } from "react-icons";
import { Spinner } from "@nextui-org/react";

export default function InteractiveAvatar() {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [dots, setDots] = useState("");

  // Valores por defecto
  const avatarId = "e4c17778854d498fbaf942dc6b7079c4";
  const language = "es";

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token); // Verificar el token
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
    }
    return "";
  }

  async function startSession() {
    setIsLoadingSession(true);
    const newToken = await fetchAccessToken();

    avatar.current = new StreamingAvatar({
      token: newToken,
    });

    avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
      console.log("Avatar started talking", e);
    });
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
      console.log("Avatar stopped talking", e);
    });
    avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      endSession();
    });
    avatar.current.on(StreamingEvents.STREAM_READY, (event) => {
      console.log(">>>>> Stream ready:", event.detail);
      setStream(event.detail);
    });
    avatar.current.on(StreamingEvents.USER_START, (event) => {
      console.log(">>>>> User started talking:", event);
      setIsUserTalking(true);
    });
    avatar.current.on(StreamingEvents.USER_STOP, (event) => {
      console.log(">>>>> User stopped talking", event);
      setIsUserTalking(false);
    });

    try {
      await avatar.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: avatarId,
        voice: {
          rate: 1.5, // 0.5 ~ 1.5
          emotion: VoiceEmotion.EXCITED,
        },
        language: language,
      });

      await avatar.current.startVoiceChat();
    } catch (error) {
      console.error("Error starting avatar session:", error);
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function endSession() {
    await avatar.current?.stopAvatar();
    setStream(undefined);
  }

  useEffect(() => {
    return () => {
      endSession();
    };
  }, []);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
      };
    }
  }, [mediaStream, stream]);

  // Animación de los puntos en "Escuchando..."
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isUserTalking) {
      interval = setInterval(() => {
        setDots((prev) => (prev.length < 3 ? prev + "." : ""));
      }, 500);
    } else {
      setDots("");
    }
    return () => {
      clearInterval(interval);
    };
  }, [isUserTalking]);

  return (
    <div
      className={`relative w-full h-screen flex flex-col ${
        !stream ? "bg-cover bg-center" : ""
      }`}
      style={{
        backgroundImage: !stream
          ? 'url("https://forevertalents.com/wp-content/uploads/2024/08/zaira-bot-background.jpg")'
          : undefined,
      }}
    >
      {!stream && (
        // Overlay oscuro antes de iniciar la llamada
        <div
          className={`absolute top-0 left-0 w-full h-full bg-black ${
            isLoadingSession ? "overlay-blink" : "opacity-50"
          }`}
        >
          {/* Texto "Llamando" con animación */}
          {isLoadingSession && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="flex items-center space-x-2">
                <FaSpinner className="animate-spin text-white text-3xl" />
                <p
                  className="text-white text-3xl font-bold"
                  style={{ textShadow: "2px 2px 4px rgba(0, 0, 0, 0.7)" }}
                >
                  Llamando
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {stream ? (
        <div className="relative w-full h-full flex justify-center items-center">
          <video
            ref={mediaStream}
            autoPlay
            playsInline
            className="absolute w-full h-full object-cover"
          >
            <track kind="captions" />
          </video>
          {isUserTalking && (
            <div className="absolute top-10 w-full text-center">
              <p
                className="text-white text-3xl font-bold"
                style={{ textShadow: "2px 2px 4px rgba(0, 0, 0, 0.7)" }}
              >
                Escuchando{dots}
              </p>
            </div>
          )}
          <div className="absolute bottom-10 w-full flex justify-center items-center space-x-40">
            {/* Icono de llamada (deshabilitado durante la sesión) */}
            <div className="flex flex-col items-center">
              <div
                className="opacity-50 flex justify-center items-center w-20 h-20 rounded-full bg-gray-500"
              >
                <IconContext.Provider
                  value={{
                    size: "2em",
                    color: "white",
                  }}
                >
                  <FaPhone />
                </IconContext.Provider>
              </div>
              <span className="text-xs text-white mt-1">Llamar</span>
            </div>
            {/* Icono para terminar la sesión */}
            <div className="flex flex-col items-center">
              <button
                onClick={endSession}
                className="flex justify-center items-center w-20 h-20 rounded-full bg-red-600"
              >
                <IconContext.Provider
                  value={{
                    size: "2em",
                    color: "white",
                  }}
                >
                  <FaPhoneSlash />
                </IconContext.Provider>
              </button>
              <span className="text-xs text-white mt-1">Terminar</span>
            </div>
          </div>
        </div>
      ) : isLoadingSession ? (
        <div className="h-full flex justify-center items-center">
          {/* Se ha movido el spinner dentro del overlay */}
        </div>
      ) : (
        <div className="relative w-full h-full flex flex-col justify-center items-center">
          {/* Texto centrado en la parte superior */}
          <div className="absolute top-10 w-full text-center">
            <p
              className="text-white text-3xl font-bold"
              style={{ textShadow: "2px 2px 4px rgba(0, 0, 0, 0.7)" }}
            >
              Zaira Bot
            </p>
          </div>
          {/* Iconos en la parte inferior */}
          <div className="absolute bottom-10 w-full flex justify-center items-center space-x-40">
            {/* Icono para iniciar la sesión */}
            <div className="flex flex-col items-center">
              <button
                onClick={startSession}
                className="animate-pulse flex justify-center items-center w-20 h-20 rounded-full bg-green-600"
              >
                <IconContext.Provider
                  value={{
                    size: "2em",
                    color: "white",
                  }}
                >
                  <FaPhone />
                </IconContext.Provider>
              </button>
              <span className="text-xs text-white mt-1">Llamar</span>
            </div>
            {/* Icono de colgar (deshabilitado antes de la sesión) */}
            <div className="flex flex-col items-center">
              <div
                className="opacity-50 flex justify-center items-center w-20 h-20 rounded-full bg-gray-500"
              >
                <IconContext.Provider
                  value={{
                    size: "2em",
                    color: "white",
                  }}
                >
                  <FaPhoneSlash />
                </IconContext.Provider>
              </div>
              <span className="text-xs text-white mt-1">Terminar</span>
            </div>
          </div>
        </div>
      )}

      {/* Definición de la animación de parpadeo */}
      <style jsx>{`
        .overlay-blink {
          animation: blink 2s infinite;
        }
        @keyframes blink {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
