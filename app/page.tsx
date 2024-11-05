"use client";

import InteractiveAvatar from "@/components/InteractiveAvatar";
export default function App() {
  return (
    <div className="w-screen h-screen flex flex-col">
      <div className="flex flex-col items-start justify-start w-full h-full">
        <div className="w-full h-full">
          <InteractiveAvatar />
        </div>
      </div>
    </div>
  );
}
