import { createContext, useContext, useState, type ReactNode } from 'react'
import { useEyeTracker, type EyeTracker } from './useEyeTracker'

export type PreviewSize = 'small' | 'medium'

type EyeContext = EyeTracker & { setPreview: (size: PreviewSize) => void }

const Context = createContext<EyeContext | null>(null)

// One camera stream, one MediaPipe loop and one calibration for the whole app.
export function EyeTrackerProvider({ children }: { children: ReactNode }) {
  const eye = useEyeTracker()
  const [preview, setPreview] = useState<PreviewSize>('small')

  return (
    <Context.Provider value={{ ...eye, setPreview }}>
      <video ref={eye.videoRef} className={`tracker-cam is-${preview}`} muted playsInline aria-hidden="true" />
      {children}
    </Context.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEye(): EyeContext {
  const eye = useContext(Context)
  if (!eye) throw new Error('useEye must be used inside EyeTrackerProvider')
  return eye
}
