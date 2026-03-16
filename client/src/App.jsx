import MapComponent from './components/map/MapComponent'

function App() {
  return (
    // `dark` class activates all Tailwind `dark:` variants across the app.
    // `h-screen w-screen` fills the full viewport — required because Leaflet
    // measures its container's pixel height from the DOM, not CSS percentages.
    // `overflow-hidden` prevents scrollbars that Leaflet's absolutely-positioned
    // tile layers can sometimes trigger.
    <div className="dark h-screen w-screen overflow-hidden bg-black">
      <MapComponent />
    </div>
  )
}

export default App
