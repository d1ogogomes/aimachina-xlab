<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { t } from '../i18n';

  export let classId: number;
  export let className: string;

  const dispatch = createEventDispatcher<{
    capture: { classId: number; images: string[] };
    close: void;
  }>();

  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let stream: MediaStream | null = null;
  
  let isRecording = false;
  let recordInterval: number;
  let capturedImages: string[] = [];
  
  // Settings
  let fps = 10;
  let holdToRecord = true;
  let duration = 5; // seconds
  let showSettings = false;

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (video) {
        video.srcObject = stream;
        video.play();
      }
    } catch (err) {
      console.error("Error accessing webcam: ", err);
      alert("Failed to access webcam. Please ensure you have granted permission.");
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }

  function captureFrame() {
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to blob URL or data URL. For ML we need data URL or image element
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    capturedImages = [...capturedImages, dataUrl];
  }

  function startRecording() {
    if (isRecording) return;
    isRecording = true;
    
    const msPerFrame = 1000 / fps;
    recordInterval = window.setInterval(captureFrame, msPerFrame);
    
    if (!holdToRecord) {
      setTimeout(() => stopRecording(), duration * 1000);
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    if (recordInterval) clearInterval(recordInterval);
  }

  function handlePointerDown() {
    if (holdToRecord) startRecording();
  }

  function handlePointerUp() {
    if (holdToRecord) stopRecording();
  }

  function toggleRecord() {
    if (!holdToRecord) {
      if (isRecording) stopRecording();
      else startRecording();
    }
  }

  function saveAndClose() {
    if (capturedImages.length > 0) {
      dispatch('capture', { classId, images: capturedImages });
    }
    close();
  }

  function close() {
    stopCamera();
    dispatch('close');
  }

  onMount(() => {
    startCamera();
  });

  onDestroy(() => {
    stopCamera();
    if (recordInterval) clearInterval(recordInterval);
  });
</script>

<!-- Backdrop -->
<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
  <!-- Modal -->
  <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col fade-up">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-600"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
        <h3 class="font-semibold text-zinc-800">Webcam - {className}</h3>
      </div>
      <button on:click={close} class="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-200 transition-colors" aria-label="Close webcam modal">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- Video Area -->
    <div class="relative bg-zinc-900 aspect-[4/3] flex items-center justify-center overflow-hidden">
      <!-- svelte-ignore a11y-media-has-caption -->
      <video bind:this={video} class="w-full h-full object-cover transform -scale-x-100 {isRecording ? 'opacity-90' : ''}" playsinline autoplay muted></video>
      <canvas bind:this={canvas} class="hidden"></canvas>
      
      {#if isRecording}
      <div class="absolute top-4 right-4 flex items-center gap-2 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse shadow-md">
        <div class="w-2 h-2 rounded-full bg-white"></div>
        REC
      </div>
      {/if}
      
      <div class="absolute bottom-4 left-4 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-md">
        {capturedImages.length} frames
      </div>
    </div>

    <!-- Controls -->
    <div class="p-4 flex items-center justify-between gap-3 bg-white">
      <div class="flex-1 flex justify-center">
        {#if holdToRecord}
        <button 
          on:pointerdown={handlePointerDown}
          on:pointerup={handlePointerUp}
          on:pointerleave={handlePointerUp}
          class="w-full max-w-[180px] py-2 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium rounded shadow-sm hover:shadow transition-all active:scale-95 flex items-center justify-center gap-2 touch-none select-none"
        >
          Hold to Record
        </button>
        {:else}
        <button 
          on:click={toggleRecord}
          class="w-full max-w-[180px] py-2 px-4 {isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white text-sm font-medium rounded shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          {isRecording ? 'Stop Recording' : 'Record'}
        </button>
        {/if}
      </div>
      
      <button on:click={() => showSettings = !showSettings} class="text-zinc-500 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-50 transition-colors" aria-label="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
    </div>

    <!-- Settings Panel -->
    {#if showSettings}
    <div class="px-5 py-4 bg-blue-50/50 border-t border-blue-100 flex flex-col gap-4 text-sm fade-up">
      <div class="flex items-center justify-between">
        <label for="webcam-fps" class="font-medium text-blue-900">FPS (Frames per second)</label>
        <input id="webcam-fps" type="number" bind:value={fps} min="1" max="60" class="w-16 px-2 py-1 border border-blue-200 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      <div class="flex items-center justify-between">
        <span class="font-medium text-blue-900">Hold to Record</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" bind:checked={holdToRecord} class="sr-only peer" aria-label="Hold to record">
          <div class="w-9 h-5 bg-blue-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>
      {#if !holdToRecord}
      <div class="flex items-center justify-between fade-in">
        <label for="webcam-duration" class="font-medium text-blue-900">Duration (seconds)</label>
        <input id="webcam-duration" type="number" bind:value={duration} min="1" max="60" class="w-16 px-2 py-1 border border-blue-200 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      {/if}
    </div>
    {/if}

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-zinc-100 flex justify-between gap-3 bg-zinc-50 items-center">
      <div class="flex gap-1 overflow-x-auto max-w-[150px] no-scrollbar">
        {#each capturedImages.slice(-5) as img}
          <img src={img} class="w-8 h-8 rounded object-cover border border-zinc-200" alt="thumbnail" />
        {/each}
        {#if capturedImages.length > 5}
          <div class="w-8 h-8 rounded border border-zinc-200 bg-zinc-100 flex items-center justify-center text-xs text-zinc-500 font-medium">+{capturedImages.length - 5}</div>
        {/if}
      </div>
      
      <div class="flex gap-2">
        <button on:click={close} class="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors">
          Cancel
        </button>
        <button on:click={saveAndClose} disabled={capturedImages.length === 0} class="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors shadow-sm">
          Add Samples
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
