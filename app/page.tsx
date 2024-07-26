"use client";

import InteractiveAvatar from "@/components/InteractiveAvatar";

export default function App() {
  return (
    <div className="w-screen h-screen flex flex-col">
      <div className="w-full h-full flex flex-col items-center justify-center">
        <InteractiveAvatar />
      </div>
    </div>
  );
}
