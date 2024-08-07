'use client'

import InteractiveAvatarCode from '@/components/InteractiveAvatarCode'

export default function App() {
  return (
    <div className="w-screen h-screen flex flex-col">
      <div className="flex-grow">
        <InteractiveAvatarCode />
      </div>
    </div>
  )
}
