import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  VoiceEmotion,
} from "@heygen/streaming-avatar";
import { useEffect, useRef, useState } from "react";
import { FaPhone, FaPhoneSlash, FaSpinner } from "react-icons/fa";
import { IconContext } from "react-icons";

// Función para normalizar cadenas (eliminar acentos, signos de puntuación y convertir a minúsculas)
const normalizeString = (str: string) =>
  str
    .normalize("NFD") // Normaliza acentos
    .replace(/[\u0300-\u036f]/g, "") // Elimina marcas diacríticas
    .replace(/[^\w\s]/g, "") // Elimina signos de puntuación
    .replace(/\s+/g, " ") // Reemplaza múltiples espacios por uno
    .trim()
    .toLowerCase();

export default function InteractiveAvatar() {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [dots, setDots] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingSong, setIsPlayingSong] = useState(false);
  const [currentSongName, setCurrentSongName] = useState<string | null>(null);

  // Map para almacenar los mensajes del avatar por task_id
  const avatarMessages = useRef<Map<string, string>>(new Map());

  // Lista de canciones
  const songList = [
    { name: "Cuatro Vidas", file: "/CuatroVidas.mp3" },
    { name: "Di Que No Es Verdad", file: "/DiQueNoEsVerdad.mp3" },
    { name: "Historia de un Amor", file: "/HistoriadeunAmor.mp3" },
    { name: "Luna Lunera", file: "/LunaLunera.mp3" },
    { name: "Nosotros", file: "/Nosotros.mp3" },
    { name: "No Te Vayas Sin Mi", file: "/NoTeVayasSinMi.mp3" },
    { name: "Piel Canela", file: "/PielCanela.mp3" },
    { name: "Sabor a Mi", file: "/SaboraMi.mp3" },
    { name: "Amor Amor", file: "/AmorAmor.mp3" },
    { name: "Cuando Vuelva a Tu Lado", file: "/CuandoVuelvaaTuLado.mp3" },
  ];

  // Valores por defecto
  const avatarId = "676a3ab0273440418ceb007502ab372c";
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
      console.log("Avatar started talking");
      // No reiniciamos el mensaje aquí
    });

    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, async (e) => {
      console.log("Avatar stopped talking");
      const taskId = e.detail.task_id;
      const fullMessage = avatarMessages.current.get(taskId) || "";

      console.log("Mensaje del avatar:", fullMessage);
      // Eliminamos el mensaje del Map
      avatarMessages.current.delete(taskId);

      // Enviar el mensaje al webhook y procesar la respuesta
      try {
        console.log("Enviando mensaje al webhook...");
        const webhookResponse = await fetch(
          "https://n8n-waryl.onrender.com/webhook/5579f88c-de69-4e85-8a10-265284eacf4c",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message: fullMessage }),
          },
        );

        const jsonResponse = await webhookResponse.json();

        console.log("Respuesta del webhook:", jsonResponse);

        // Ajuste aquí: acceder directamente a jsonResponse.intencion
        if (jsonResponse && jsonResponse.intencion) {
          const { intencion, musica_nombre } = jsonResponse;

          console.log("Intención:", intencion);
          console.log("Música nombre:", musica_nombre);

          // Manejar acciones basadas en 'intencion'
          switch (intencion) {
            case "reproducir":
              if (musica_nombre) {
                // Buscar la canción en la lista
                const foundSong = songList.find((song) => {
                  const normalizedSongName = normalizeString(song.name);
                  const songFound =
                    normalizeString(musica_nombre) === normalizedSongName;

                  return songFound;
                });

                if (foundSong) {
                  console.log("Canción encontrada:", foundSong.name);
                  // Reproducir la canción
                  playSong(foundSong.file, foundSong.name);
                } else {
                  console.log("No se encontró la canción en la lista.");
                  // Opcionalmente, hacer que el avatar diga que no encontró la canción
                  await avatar.current?.speak({
                    text: "Lo siento, no encontré esa canción.",
                  });
                }
              }
              break;

            case "subir_volumen":
              // Aumentar el volumen
              const adjustedUp = adjustVolume(0.3); // Aumenta el volumen en un 30%

              if (adjustedUp) {
                console.log("Subiendo el volumen.");
              } else {
                console.log("No hay música reproduciéndose.");
              }
              break;

            case "bajar_volumen":
              // Disminuir el volumen
              const adjustedDown = adjustVolume(-0.3); // Disminuye el volumen en un 30%

              if (adjustedDown) {
                console.log("Bajando el volumen.");
              } else {
                console.log("No hay música reproduciéndose.");
              }
              break;

            case "detener":
              // Detener la música
              if (audioRef.current) {
                stopSong();
                console.log("La música ha sido detenida.");
              } else {
                console.log("No hay música reproduciéndose.");
              }
              break;

            default:
              console.log("Intención desconocida o no se requiere acción.");
            // No hacer nada
          }
        } else {
          console.log("Respuesta del webhook no tiene el formato esperado.");
        }
      } catch (error) {
        console.error(
          "Error al enviar o procesar la respuesta del webhook:",
          error,
        );
      }
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
      console.log(">>>>> User started talking");
      setIsUserTalking(true);
    });

    avatar.current.on(StreamingEvents.USER_STOP, (event) => {
      console.log(">>>>> User stopped talking");
      setIsUserTalking(false);
    });

    // Evento para capturar el mensaje del usuario
    avatar.current.on(
      StreamingEvents.USER_TALKING_MESSAGE,
      async (messageEvent) => {
        console.log("Mensaje del usuario:", messageEvent.detail.message);

        // Aquí puedes mantener tu lógica actual o adaptarla según necesites
      },
    );

    // Evento para capturar los fragmentos del mensaje del avatar
    avatar.current.on(
      StreamingEvents.AVATAR_TALKING_MESSAGE,
      (messageEvent) => {
        const taskId = messageEvent.detail.task_id;
        const messagePart = messageEvent.detail.message;

        if (!avatarMessages.current.has(taskId)) {
          avatarMessages.current.set(taskId, "");
        }
        // Concatenar el fragmento al mensaje correspondiente
        const currentMessage = avatarMessages.current.get(taskId)!;

        avatarMessages.current.set(taskId, currentMessage + messagePart);
      },
    );

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
    // Detener cualquier audio en reproducción
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setCurrentSongName(null);
    }
    // Limpiar el Map de mensajes
    avatarMessages.current.clear();
  }

  const playSong = (file: string, songName: string) => {
    console.log("Intentando reproducir la canción:", file);
    // Detener el audio actual si existe
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    const newAudio = new Audio(file);

    newAudio.volume = 0.5; // Volumen inicial al 50%
    newAudio.play().catch((error) => {
      console.error("Error al reproducir la canción:", error);
    });
    audioRef.current = newAudio;
    setIsPlayingSong(true);
    setCurrentSongName(songName);

    newAudio.onended = () => {
      setIsPlayingSong(false);
      setCurrentSongName(null);
      audioRef.current = null;
    };
  };

  const stopSong = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setIsPlayingSong(false);
      setCurrentSongName(null);
      console.log("Canción detenida.");
    }
  };

  // Función para ajustar el volumen
  const adjustVolume = (change: number) => {
    if (audioRef.current) {
      let newVolume = audioRef.current.volume + change;

      // Asegurarse de que el volumen esté entre 0 y 1
      newVolume = Math.min(Math.max(newVolume, 0), 1);
      audioRef.current.volume = newVolume;
      console.log(`Volumen ajustado a: ${Math.round(newVolume * 100)}%`);

      return true;
    } else {
      console.log("No hay ninguna canción reproduciéndose.");

      return false;
    }
  };

  useEffect(() => {
    return () => {
      endSession();
      // Limpiar el audio al desmontar el componente
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play().catch((error) => {
          console.error("Error al reproducir el video del avatar:", error);
        });
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
          ? 'url("https://forevertalents.com/wp-content/uploads/2024/07/nanci-bot-background.jpg")'
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
          {isPlayingSong && currentSongName && (
            <div className="absolute bottom-32 w-full text-center">
              <p
                className="text-white text-2xl"
                style={{ textShadow: "2px 2px 4px rgba(0, 0, 0, 0.7)" }}
              >
                Reproduciendo: {currentSongName}
              </p>
            </div>
          )}
          <div className="absolute bottom-10 w-full flex justify-center items-center space-x-40">
            {/* Icono de llamada (deshabilitado durante la sesión) */}
            <div className="flex flex-col items-center">
              <div className="opacity-50 flex justify-center items-center w-20 h-20 rounded-full bg-gray-500">
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
                className="flex justify-center items-center w-20 h-20 rounded-full bg-red-600"
                onClick={endSession}
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
              Nanci Bot
            </p>
          </div>
          {/* Iconos en la parte inferior */}
          <div className="absolute bottom-10 w-full flex justify-center items-center space-x-40">
            {/* Icono para iniciar la sesión */}
            <div className="flex flex-col items-center">
              <button
                className="animate-pulse flex justify-center items-center w-20 h-20 rounded-full bg-green-600"
                onClick={startSession}
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
              <div className="opacity-50 flex justify-center items-center w-20 h-20 rounded-full bg-gray-500">
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
      <style>{`
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
