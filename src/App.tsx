import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Vision Tasks</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Your new Electron app with React and Tailwind CSS
          </p>
        </div>
        
        <div className="bg-card p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              onClick={() => setCount(count => count + 1)}
            >
              Count is {count}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
