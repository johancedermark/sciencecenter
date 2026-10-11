# Lessons

- **Parallel builders + one shared browser don't mix.** Ten agents driving the user's Chrome froze tabs and
  produced false "freeze" bug reports. Give builders a headless Chrome over CDP with their own profile and port,
  and tell them to kill their headless processes when done (stuck ones blocked an agent for 40 min).
- **Never assume default dev ports are free.** Another project held 5173. Use a fixed, unusual port with
  `strictPort` per project (here 5180/8790).
- **Background tabs throttle rAF.** Loading code that awaits `requestAnimationFrame` must have a timeout fallback.
- **Compile shaders with `compileAsync`, per area**, so the page never blocks for seconds on load.
- **Check lighting with screenshots early.** A bright hemisphere light, a low bloom threshold and light walls
  washed the scene out; tune globally in core before rooms tune locally.
- **Companion placement must respect the camera.** Pick slots with a minimum camera distance and inside the frame,
  prefer the side the HUD panel doesn't cover.
- **Heredocs:** quote them (`<<'EOF'`) when the content has backticks or `$`.
