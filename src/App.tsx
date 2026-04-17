/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Download, 
  Move, 
  Maximize, 
  Type, 
  Settings, 
  Play, 
  Pause, 
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Crop,
  ImagePlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

// Constants for the Instagram Story format (9:16)
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const PREVIEW_SCALE = 0.25; // Scale down for preview in UI

type LayoutMode = 'standard' | 'full_9_16';

interface EditorState {
  videoSrc: string | null;
  mediaType: 'video' | 'image';
  backgroundSrc: string | null; // fundo.png
  layoutSrc: string | null;     // layout_video.png
  logoSrc: string | null;       // logo_header.png
  logoY: number;                // Posição Y do logo
  logoScale: number;            // Escala do logo
  title: string;
  subtitle: string;
  titleFontSize: number;
  subtitleFontSize: number;
  videoX: number;
  videoY: number;
  videoScale: number;
  marginTop: number;
  marginBottom: number;
  layoutMode: LayoutMode;
  startTime: number;
  endTime: number;
}

export default function App() {
  const [state, setState] = useState<EditorState>({
    videoSrc: null,
    mediaType: 'video',
    backgroundSrc: '/assets/fundo.png',
    layoutSrc: '/assets/layout_video.png',
    logoSrc: '/assets/logo.png',
    logoY: -40,
    logoScale: 1,
    title: 'URGENTE!',
    subtitle: 'CASO LEANDRO LO:\nJÚRI RECONHECE LEGÍTIMA\nDEFESA E ABSOLVE PM',
    titleFontSize: 48,
    subtitleFontSize: 44,
    videoX: 0,
    videoY: 0,
    videoScale: 1,
    marginTop: 360,
    marginBottom: 512,
    layoutMode: 'standard',
    startTime: 0,
    endTime: 0, // 0 significa o fim do vídeo
  });

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaImageRef = useRef<HTMLImageElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const layoutImageRef = useRef<HTMLImageElement | null>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const requestRef = useRef<number>(null);
  
  // Web Audio API refs for iOS/Mobile audio capture
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Carregar fonte Unbounded
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  // Moved draw up to fix declaration order
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Fundo Base (Preto)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Desenhar Fundo (fundo.png) se existir
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Título Narrativas (Apenas se não tiver fundo e não for modo Full com logo)
    if (!bgImageRef.current && !(state.layoutMode === 'full_9_16' && state.logoSrc)) {
      // Fallback: Desenhar cabeçalho manual se não houver imagem
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, CANVAS_WIDTH, 300);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 40px Unbounded';
      ctx.textAlign = 'center';
      ctx.fillText('NARRATIVAS CRIMINAIS', CANVAS_WIDTH / 2, 150);
    }

    // 3. Área do Vídeo
    ctx.save();
    let videoAreaY = 0;
    let videoAreaH = CANVAS_HEIGHT;

    if (state.layoutMode === 'standard') {
      videoAreaY = state.marginTop;
      videoAreaH = CANVAS_HEIGHT - state.marginTop - state.marginBottom;
      
      ctx.beginPath();
      ctx.rect(0, videoAreaY, CANVAS_WIDTH, videoAreaH);
      ctx.clip();

      // Desenhar layout_video.png se existir
      if (layoutImageRef.current) {
        ctx.drawImage(layoutImageRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else if (!state.videoSrc) {
        // Guia visual Magenta
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 10;
        ctx.strokeRect(50, videoAreaY + 50, CANVAS_WIDTH - 100, videoAreaH - 100);
        ctx.fillStyle = '#ff00ff';
        ctx.font = 'bold 60px Unbounded';
        ctx.textAlign = 'center';
        ctx.fillText('ÁREA DO VÍDEO', CANVAS_WIDTH / 2, videoAreaY + videoAreaH / 2);
      }
    }

    // 4. Desenhar o Mídia Real (Vídeo ou Imagem)
    if (state.videoSrc) {
      let mWidth = 0;
      let mHeight = 0;
      let mediaElement: HTMLVideoElement | HTMLImageElement | null = null;
      
      if (state.mediaType === 'image' && mediaImageRef.current) {
        mediaElement = mediaImageRef.current;
        mWidth = (mediaElement as HTMLImageElement).naturalWidth;
        mHeight = (mediaElement as HTMLImageElement).naturalHeight;
      } else if (state.mediaType === 'video' && video) {
        mediaElement = video;
        mWidth = (mediaElement as HTMLVideoElement).videoWidth;
        mHeight = (mediaElement as HTMLVideoElement).videoHeight;
      }
      
      // Só desenha se tiver dimensões válidas
      if (mediaElement && mWidth > 0 && mHeight > 0) {
        const vAspectRatio = mWidth / mHeight;
        let drawWidth, drawHeight;
        
        if (state.layoutMode === 'standard') {
          if (vAspectRatio > CANVAS_WIDTH / videoAreaH) {
            drawHeight = videoAreaH * state.videoScale;
            drawWidth = drawHeight * vAspectRatio;
          } else {
            drawWidth = CANVAS_WIDTH * state.videoScale;
            drawHeight = drawWidth / vAspectRatio;
          }
        } else {
          drawWidth = CANVAS_WIDTH * state.videoScale;
          drawHeight = drawWidth / vAspectRatio;
        }

        const x = (CANVAS_WIDTH - drawWidth) / 2 + state.videoX;
        const y = (state.layoutMode === 'standard' ? videoAreaY + (videoAreaH - drawHeight) / 2 : (CANVAS_HEIGHT - drawHeight) / 2) + state.videoY;

        ctx.drawImage(mediaElement, x, y, drawWidth, drawHeight);
      }
    }
    ctx.restore();

    // 5. Título e Subtítulo (Sempre no topo de tudo)
    ctx.save();
    const bottomY = 1640;
    
    // Gradientes e Logo para o modo Full 9:16
    if (state.layoutMode === 'full_9_16') {
      // Gradiente Topo (para a Logo)
      if (state.logoSrc) {
        const topGradient = ctx.createLinearGradient(0, 0, 0, 300);
        topGradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
        topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, 300);
        
        if (logoImageRef.current) {
          ctx.save();
          // Aplicando a escala e movendo baseado no centro do topo
          ctx.translate(CANVAS_WIDTH / 2, 100 + state.logoY);
          ctx.scale(state.logoScale, state.logoScale);
          ctx.drawImage(logoImageRef.current, -logoImageRef.current.width / 2, -logoImageRef.current.height / 2);
          ctx.restore();
        }
      }

      // Gradiente Base (para o Texto)
      const gradient = ctx.createLinearGradient(0, 1200, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.8)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 1200, CANVAS_WIDTH, CANVAS_HEIGHT - 1200);
    }

    // Título (URGENTE!)
    ctx.font = `700 ${state.titleFontSize}px Unbounded`;
    const titleText = state.title.toUpperCase();
    const titleWidth = ctx.measureText(titleText).width;
    const rectW = titleWidth + 120;
    const rectH = state.titleFontSize * 1.77; // Proporcional ao tamanho da fonte
    const rectX = (CANVAS_WIDTH - rectW) / 2;
    const rectY = bottomY - 180;

    // Caixa Vermelha
    if (state.title) {
      ctx.fillStyle = '#4c0303';
      ctx.strokeStyle = '#d00303';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const slant = 25;
      ctx.moveTo(rectX + slant, rectY);
      ctx.lineTo(rectX + rectW + slant, rectY);
      ctx.lineTo(rectX + rectW - slant, rectY + rectH);
      ctx.lineTo(rectX - slant, rectY + rectH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(titleText, CANVAS_WIDTH / 2, rectY + rectH / 2 + (state.titleFontSize * 0.33));
    }

    // Subtítulo
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${state.subtitleFontSize}px Unbounded`;
    ctx.textAlign = 'center';
    const lines = state.subtitle.toUpperCase().split('\n');
    const lineHeight = state.subtitleFontSize * 1.14; // Proporcional
    const subtitleStartY = rectY + rectH + 75; // Ajuste fino: desceu um pouco
    lines.forEach((line, i) => {
      ctx.fillText(line, CANVAS_WIDTH / 2, subtitleStartY + (i * lineHeight));
    });
    ctx.restore();
  }, [state]);

  // Loop de Animação para o Canvas (Preview em tempo real)
  useEffect(() => {
    const animate = () => {
      draw();
      requestRef.current = requestAnimationFrame(animate);
    };
    
    // Só rodamos o loop se tiver algo para desenhar
    requestRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [draw]);

  // Pre-carregar imagens base (fundo, layout, logo)
  useEffect(() => {
    const loadAsset = (url: string | null, ref: React.MutableRefObject<HTMLImageElement | null>) => {
      if (!url) return;
      const img = new Image();
      img.src = url;
      img.onload = () => {
        ref.current = img;
        draw();
      };
      img.onerror = () => {
        console.warn(`Não foi possível carregar o asset: ${url}. Verifique se o arquivo existe na pasta /public/assets/`);
      };
    };

    loadAsset(state.backgroundSrc, bgImageRef);
    loadAsset(state.layoutSrc, layoutImageRef);
    loadAsset(state.logoSrc, logoImageRef);
  }, [state.backgroundSrc, state.layoutSrc, state.logoSrc]);

  // Forçar carregamento do vídeo ou imagem quando o SRC mudar
  useEffect(() => {
    if (!state.videoSrc) return;
    
    if (state.mediaType === 'image') {
      const img = new Image();
      img.src = state.videoSrc;
      img.onload = () => {
        mediaImageRef.current = img;
        draw();
      };
    } else if (videoRef.current) {
      videoRef.current.load();
      // Garantir que o vídeo tente tocar um pouco para carregar o primeiro frame
      videoRef.current.currentTime = 0.1; 
      videoRef.current.onloadeddata = () => {
        draw();
      };
    }
  }, [state.videoSrc, state.mediaType, draw]);

  // Carregar Assets
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'video' | 'background' | 'layout' | 'logo') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);

    if (type === 'video') {
      const isImage = file.type.startsWith('image/');
      setState(prev => ({ 
        ...prev, 
        videoSrc: url, 
        mediaType: isImage ? 'image' : 'video',
        videoX: 0, 
        videoY: 0, 
        videoScale: 1,
        startTime: 0,
        endTime: 0 
      }));
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    } else if (type === 'background') {
      setState(prev => ({ ...prev, backgroundSrc: url }));
    } else if (type === 'layout') {
      setState(prev => ({ ...prev, layoutSrc: url }));
    } else if (type === 'logo') {
      setState(prev => ({ ...prev, logoSrc: url }));
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (!videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch((error) => {
              console.warn("Playback interrupted or prevented:", error);
              setIsPlaying(false);
            });
        } else {
          setIsPlaying(true);
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const v = videoRef.current;
      setDuration(v.duration);
      if (state.endTime === 0) {
        setState(prev => ({ ...prev, endTime: v.duration }));
      }
      // Garante que o vídeo comece no startTime ao carregar
      v.currentTime = state.startTime;
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const v = videoRef.current;
      setCurrentTime(v.currentTime);
      
      // Se passou do tempo final, volta para o início (loop no range)
      // Usamos uma pequena margem (0.1) para garantir o loop fluido
      if (isPlaying && state.endTime > 0 && v.currentTime >= state.endTime - 0.05) {
        v.currentTime = state.startTime;
      }
    }
  };

  const handleExport = async () => {
    if (!canvasRef.current || !state.videoSrc) return;
    
    setIsExporting(true);
    setExportProgress(0);

    const canvas = canvasRef.current;
    
    // Se for Imagem (Foto), exportar uma imagem estática instantaneamente
    if (state.mediaType === 'image') {
      // Redesenha para garantir que o frame final está perfeito
      draw();
      
      const imageURL = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imageURL;
      a.download = `narrativas_criminais_${Date.now()}.png`;
      a.click();
      
      setIsExporting(false);
      setExportProgress(100);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
      return;
    }
    
    // Exportação de Vídeo
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    // Capture video from canvas
    const stream = canvas.captureStream(30); // 30 FPS
    
    // Capture audio from video element
    try {
      // Tenta usar captureStream primeiro (Chrome/Firefox)
      // @ts-ignore - captureStream is not in standard TS types for HTMLVideoElement
      let videoStream = video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null;
      
      // Fallback para Safari/iOS usando Web Audio API
      if (!videoStream || videoStream.getAudioTracks().length === 0) {
        // @ts-ignore
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass && !audioCtxRef.current) {
          audioCtxRef.current = new AudioContextClass();
          audioSourceRef.current = audioCtxRef.current.createMediaElementSource(video);
          audioDestRef.current = audioCtxRef.current.createMediaStreamDestination();
          
          // Conecta o áudio do vídeo ao destino de gravação
          audioSourceRef.current.connect(audioDestRef.current);
          // Conecta aos alto-falantes para não mutar o vídeo original
          audioSourceRef.current.connect(audioCtxRef.current.destination);
        }
        
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
        
        if (audioDestRef.current) {
          videoStream = audioDestRef.current.stream;
        }
      }

      if (videoStream) {
        const audioTracks = videoStream.getAudioTracks();
        if (audioTracks.length > 0) {
          stream.addTrack(audioTracks[0]);
        }
      }
    } catch (err) {
      console.warn("Could not capture audio stream:", err);
    }
    
    // Detecta o melhor formato suportado pelo navegador (Safari suporta mp4, Chrome suporta webm com h264)
    const getSupportedMimeType = () => {
      const types = [
        'video/mp4',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9',
        'video/webm'
      ];
      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      }
      return '';
    };

    const mimeType = getSupportedMimeType();
    
    // We need to record the video while it plays
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5000000 // 5 Mbps for mobile stability
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    
    recorder.onstop = async () => {
      // Forçamos a extensão .mp4. Se o navegador gravou em h264, a maioria dos celulares vai ler perfeitamente.
      const blob = new Blob(chunks, { type: mimeType.includes('mp4') ? 'video/mp4' : 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `narrativas_criminais_${Date.now()}.mp4`;
      a.click();
      
      setIsExporting(false);
      setExportProgress(100);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
    };

    // Reset video to start of range
    video.pause();
    video.currentTime = state.startTime;
    video.loop = false; // Desativa o loop durante a exportação
    video.muted = false; // Desativa o mute para capturar o áudio
    
    const startRecording = () => {
      if (recorder.state === 'inactive') {
        recorder.start(1000); // Grava em pedaços de 1 segundo
        setIsPlaying(true);
      }
    };

    // Aguarda o vídeo estar pronto no início antes de dar play e começar a gravar
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      
      video.play().then(() => {
        // No mobile, às vezes onplaying demora, então garantimos o início aqui ou no playing
        startRecording();
      }).catch(e => {
        console.error("Erro ao iniciar reprodução para exportação:", e);
        setIsExporting(false);
      });
    };

    video.addEventListener('seeked', onSeeked);
    
    // Fallback caso o seeked não dispare (vídeo já estava no ponto certo)
    setTimeout(() => {
      if (Math.abs(video.currentTime - state.startTime) < 0.2 && recorder.state === 'inactive') {
        onSeeked();
      }
    }, 500);

    const interval = setInterval(() => {
      if (video.duration > 0 && (video.ended || video.currentTime >= state.endTime - 0.05)) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        setIsPlaying(false);
        video.pause();
        video.loop = true; // Reativa o loop após a exportação
        video.muted = true; // Reativa o mute após a exportação
        clearInterval(interval);
      } else if (video.duration > 0 && recorder.state === 'recording') {
        // Ajusta progresso baseado no range
        const totalRange = state.endTime - state.startTime;
        const currentProgress = (video.currentTime - state.startTime) / totalRange;
        setExportProgress(Math.min(100, Math.max(0, currentProgress * 100)));
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-red-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-700 rounded-lg flex items-center justify-center shadow-lg shadow-red-900/20">
              <Maximize className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight font-['Unbounded']">NARRATIVAS <span className="text-red-600">CRIMINAIS</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleExport}
              disabled={!state.videoSrc || isExporting}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-white/10 disabled:text-white/30 px-5 py-2 rounded-full font-bold transition-all active:scale-95 shadow-lg shadow-red-600/20"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Exportando... {Math.round(exportProgress)}%
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  {state.mediaType === 'image' ? 'Exportar Imagem' : 'Exportar MP4'}
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
        {/* Left Column: Preview (Fixed on Mobile, Sticky on Desktop) */}
        <div className="fixed bottom-6 right-6 z-40 lg:static lg:sticky lg:top-24 lg:right-auto lg:col-span-4 flex flex-col gap-4 pointer-events-none lg:pointer-events-auto">
          <div className="relative aspect-[9/16] bg-black rounded-xl lg:rounded-3xl overflow-hidden border border-white/20 shadow-2xl ml-auto lg:mx-auto w-[120px] sm:w-[160px] lg:w-full max-w-[360px] pointer-events-auto transition-all shadow-black/50 overflow-hidden ring-1 ring-white/10">
            {/* Canvas for Preview */}
            <canvas 
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
            />
            
            {!state.videoSrc && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-2 lg:p-8 text-center">
                <div className="w-8 h-8 lg:w-20 lg:h-20 bg-white/5 rounded-full flex items-center justify-center mb-2 lg:mb-6 border border-white/10">
                  <Upload className="w-4 h-4 lg:w-10 lg:h-10 text-white/40" />
                </div>
                <h3 className="text-[10px] lg:text-xl font-bold mb-1 lg:mb-2 leading-tight">Nenhum Mídia</h3>
                <p className="hidden lg:block text-white/50 text-sm mb-6">Faça o upload de um vídeo ou foto para começar a editar a arte.</p>
                <label className="bg-white text-black px-2 py-1 lg:px-6 lg:py-3 rounded-full text-[10px] lg:text-base font-bold cursor-pointer hover:bg-white/90 transition-all active:scale-95 whitespace-nowrap">
                  Selecionar
                  <input type="file" accept="video/*,image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'video')} />
                </label>
              </div>
            )}

            {/* Playback Controls Overlay (Only for Video) */}
            {state.videoSrc && state.mediaType === 'video' && (
              <div className="absolute bottom-2 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 lg:gap-4 bg-black/80 backdrop-blur-md px-2 lg:px-6 py-1 lg:py-3 rounded-full border border-white/20 opacity-100 transition-all scale-75 lg:scale-100 origin-bottom z-30 shadow-lg">
                <button onClick={togglePlay} className="p-1 lg:p-2 hover:text-red-500 transition-colors">
                  {isPlaying ? <Pause className="w-3 h-3 lg:w-6 lg:h-6 fill-current" /> : <Play className="w-3 h-3 lg:w-6 lg:h-6 fill-current" />}
                </button>
                <button onClick={() => { if(videoRef.current) videoRef.current.currentTime = state.startTime; }} className="p-1 lg:p-2 hover:text-red-500 transition-colors">
                  <RotateCcw className="w-3 h-3 lg:w-5 lg:h-5" />
                </button>
                <div className="hidden lg:block text-xs font-mono text-white/50 w-24 text-center">
                  {currentTime.toFixed(1)}s / {state.endTime.toFixed(1)}s
                </div>
              </div>
            )}
          </div>

          {/* Video element (hidden) */}
          <video 
            ref={videoRef}
            src={state.videoSrc || undefined}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={draw}
            onCanPlay={draw}
            onSeeked={draw}
            className="hidden"
            loop
            muted
            playsInline
            crossOrigin="anonymous"
          />
        </div>

        {/* Right Column: Controls */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Timeline Selection (Video only) */}
          {state.videoSrc && state.mediaType === 'video' && duration > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-600/20 rounded-lg text-red-500">
                    <Settings className="w-5 h-5" />
                  </div>
                  <h2 className="font-bold text-lg tracking-tight font-['Unbounded'] text-sm uppercase">Corte do Vídeo (Range)</h2>
                </div>
                <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                  {state.startTime.toFixed(1)}s — {state.endTime.toFixed(1)}s (Total: {(state.endTime - state.startTime).toFixed(1)}s)
                </div>
              </div>

              <div className="relative h-16 sm:h-20 bg-black/40 rounded-xl border border-white/10 overflow-hidden mb-6 group select-none">
                {/* Visual grid/marks */}
                <div className="absolute inset-0 opacity-10 flex justify-between px-2">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-full w-px bg-white" />
                  ))}
                </div>

                {/* Selected Range Background */}
                <div 
                  className="absolute h-full bg-red-600/20 border-x-2 border-red-600 z-10"
                  style={{ 
                    left: `${(state.startTime / duration) * 100}%`,
                    width: `${((state.endTime - state.startTime) / duration) * 100}%` 
                  }}
                />

                {/* Playhead */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-white z-30 shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                >
                  <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white rounded-full shadow-lg" />
                </div>

                {/* Handlers Area */}
                <div className="absolute inset-0 z-40">
                  {/* Start Slider */}
                  <input 
                    type="range"
                    min="0"
                    max={duration}
                    step="0.01"
                    value={state.startTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val < state.endTime - 0.1) {
                        setState(prev => ({ ...prev, startTime: val }));
                        if (videoRef.current) videoRef.current.currentTime = val;
                      }
                    }}
                    className="absolute top-0 left-0 w-full h-1/2 opacity-0 cursor-pointer"
                  />
                  {/* End Slider */}
                  <input 
                    type="range"
                    min="0"
                    max={duration}
                    step="0.01"
                    value={state.endTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val > state.startTime + 0.1) {
                        setState(prev => ({ ...prev, endTime: val }));
                        if (videoRef.current) videoRef.current.currentTime = val;
                      }
                    }}
                    className="absolute bottom-0 left-0 w-full h-1/2 opacity-0 cursor-pointer"
                  />
                </div>
                
                <div className="absolute inset-x-0 top-0 text-[8px] text-white/20 uppercase font-bold flex justify-between px-2 py-1 pointer-events-none">
                  <span>Início (Arraste topo)</span>
                  <span>Fim (Arraste base)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Início Manual</label>
                    <button 
                      onClick={() => {
                        setState(prev => ({ ...prev, startTime: currentTime }));
                        if (videoRef.current) videoRef.current.currentTime = currentTime;
                      }}
                      className="text-[10px] text-red-500 font-bold hover:underline"
                    >
                      Usar Atual
                    </button>
                  </div>
                  <input 
                    type="number"
                    step="0.1"
                    min="0"
                    max={state.endTime}
                    value={state.startTime.toFixed(1)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setState(prev => ({ ...prev, startTime: Math.max(0, val) }));
                    }}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Fim Manual</label>
                    <button 
                      onClick={() => {
                        setState(prev => ({ ...prev, endTime: currentTime }));
                        if (videoRef.current) videoRef.current.currentTime = currentTime;
                      }}
                      className="text-[10px] text-red-500 font-bold hover:underline"
                    >
                      Usar Atual
                    </button>
                  </div>
                  <input 
                    type="number"
                    step="0.1"
                    min={state.startTime}
                    max={duration}
                    value={state.endTime.toFixed(1)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setState(prev => ({ ...prev, endTime: Math.min(duration, val) }));
                    }}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Assets Upload */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="w-5 h-5 text-red-500" />
              <h2 className="font-bold text-lg">Arquivos de Base (PNG)</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 bg-black/30 border border-white/5 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-lg">
                    <Upload className="w-4 h-4 text-white/40" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold">Fundo (fundo.png)</p>
                    <p className="text-[9px] text-white/30 uppercase tracking-wider">{state.backgroundSrc ? 'Carregado ✓' : 'Não selecionado'}</p>
                  </div>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'background')} />
              </label>

              <label className="flex items-center justify-between p-3 bg-black/30 border border-white/5 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-lg">
                    <Upload className="w-4 h-4 text-white/40" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold">Área Vídeo (layout_video.png)</p>
                    <p className="text-[9px] text-white/30 uppercase tracking-wider">{state.layoutSrc ? 'Carregado ✓' : 'Não selecionado'}</p>
                  </div>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'layout')} />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              {/* Logo/Cabeçalho (PNG sem fundo) */}
              <label className="group cursor-pointer">
                <div className={`flex items-center gap-4 p-4 rounded-xl border-2 border-dashed transition-all ${state.logoSrc ? 'bg-red-600/10 border-red-600' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                  <div className={`p-3 rounded-lg ${state.logoSrc ? 'bg-red-600 text-white' : 'bg-white/10 text-white/50'}`}>
                    <ImagePlus className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Logo/Cabeçalho (PNG)</p>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider">{state.logoSrc ? 'Carregado ✓' : 'Para modo Full 9:16'}</p>
                  </div>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'logo')} />
              </label>

              {state.logoSrc && state.layoutMode === 'full_9_16' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Posição Y Logo</label>
                      <span className="text-[10px] font-mono text-red-500">{state.logoY}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="-300" 
                      max="300" 
                      step="1"
                      value={state.logoY}
                      onChange={(e) => setState(prev => ({ ...prev, logoY: parseInt(e.target.value) }))}
                      className="w-full accent-red-600"
                    />
                  </div>
                  <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Escala Logo</label>
                      <span className="text-[10px] font-mono text-red-500">{Math.round(state.logoScale * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2" 
                      step="0.01"
                      value={state.logoScale}
                      onChange={(e) => setState(prev => ({ ...prev, logoScale: parseFloat(e.target.value) }))}
                      className="w-full accent-red-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Layout Mode Toggle */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Maximize className="w-5 h-5 text-red-500" />
              <h2 className="font-bold text-lg">Modo de Layout</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setState(prev => ({ ...prev, layoutMode: 'standard' }))}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${state.layoutMode === 'standard' ? 'bg-red-600/10 border-red-600 text-red-500' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
              >
                <Crop className="w-8 h-8" />
                <span className="text-xs font-bold uppercase tracking-wider">Padrão (Crop)</span>
              </button>
              <button 
                onClick={() => setState(prev => ({ ...prev, layoutMode: 'full_9_16' }))}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${state.layoutMode === 'full_9_16' ? 'bg-red-600/10 border-red-600 text-red-500' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
              >
                <Maximize className="w-8 h-8" />
                <span className="text-xs font-bold uppercase tracking-wider">Full (9:16)</span>
              </button>
            </div>
          </div>

          {/* Text Controls */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Type className="w-5 h-5 text-red-500" />
              <h2 className="font-bold text-lg">Conteúdo do Texto</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2 block">Título (Caixa Vermelha)</label>
                <input 
                  type="text" 
                  value={state.title}
                  onChange={(e) => setState(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-red-600 transition-colors font-['Unbounded']"
                />
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-white/40 uppercase font-bold whitespace-nowrap">Tamanho:</span>
                    <input 
                      type="range" 
                      min="20" 
                      max="100" 
                      value={state.titleFontSize}
                      onChange={(e) => setState(prev => ({ ...prev, titleFontSize: parseInt(e.target.value) }))}
                      className="flex-1 accent-red-600"
                    />
                    <span className="text-[10px] font-mono text-red-500 w-6 text-right">{state.titleFontSize}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2 block">Subtítulo (Use \n para quebra)</label>
                <textarea 
                  rows={2}
                  value={state.subtitle}
                  onChange={(e) => setState(prev => ({ ...prev, subtitle: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-red-600 transition-colors font-['Unbounded'] text-sm"
                />
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-white/40 uppercase font-bold whitespace-nowrap">Tamanho:</span>
                    <input 
                      type="range" 
                      min="20" 
                      max="100" 
                      value={state.subtitleFontSize}
                      onChange={(e) => setState(prev => ({ ...prev, subtitleFontSize: parseInt(e.target.value) }))}
                      className="flex-1 accent-red-600"
                    />
                    <span className="text-[10px] font-mono text-red-500 w-6 text-right">{state.subtitleFontSize}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Video Positioning */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Move className="w-5 h-5 text-red-500" />
              <h2 className="font-bold text-lg">Ajuste do Vídeo</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <div className="flex justify-between mb-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Escala</label>
                    <span className="text-[10px] font-mono text-white/60">{state.videoScale.toFixed(2)}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="3" 
                    step="0.01"
                    value={state.videoScale}
                    onChange={(e) => setState(prev => ({ ...prev, videoScale: parseFloat(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={() => setState(prev => ({ ...prev, videoX: 0, videoY: 0, videoScale: 1, marginTop: 360, marginBottom: 512 }))}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors h-[38px]"
                  >
                    Resetar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Margem Topo</label>
                    <span className="text-[9px] font-mono text-white/60">{state.marginTop}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1000" 
                    value={state.marginTop}
                    onChange={(e) => setState(prev => ({ ...prev, marginTop: parseInt(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Margem Base</label>
                    <span className="text-[9px] font-mono text-white/60">{state.marginBottom}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1000" 
                    value={state.marginBottom}
                    onChange={(e) => setState(prev => ({ ...prev, marginBottom: parseInt(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Posição X</label>
                    <span className="text-[9px] font-mono text-white/60">{state.videoX}</span>
                  </div>
                  <input 
                    type="range" 
                    min="-500" 
                    max="500" 
                    value={state.videoX}
                    onChange={(e) => setState(prev => ({ ...prev, videoX: parseInt(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Posição Y</label>
                    <span className="text-[9px] font-mono text-white/60">{state.videoY}</span>
                  </div>
                  <input 
                    type="range" 
                    min="-500" 
                    max="500" 
                    value={state.videoY}
                    onChange={(e) => setState(prev => ({ ...prev, videoY: parseInt(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Export Progress Modal */}
      <AnimatePresence>
        {isExporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6"
          >
            <div className="max-w-md w-full text-center">
              <div className="w-24 h-24 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
                <div 
                  className="absolute inset-0 border-4 border-red-600 rounded-full transition-all duration-300" 
                  style={{ clipPath: `inset(0 0 ${100 - exportProgress}% 0)` }}
                />
                <Download className="w-10 h-10 text-red-600 animate-bounce" />
              </div>
              <h2 className="text-3xl font-bold mb-4 font-['Unbounded']">Exportando Arte</h2>
              <p className="text-white/60 mb-8">Processando os frames e gerando o vídeo final em 1080p. Por favor, não feche esta aba.</p>
              
              <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden mb-4">
                <motion.div 
                  className="h-full bg-red-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-white/40">
                <span>Progresso</span>
                <span>{Math.round(exportProgress)}%</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3 opacity-50">
            <Settings className="w-5 h-5" />
            <span className="text-sm">Configurações de Exportação: 1080x1920 MP4 (WebM) @ 30FPS</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-bold text-white/30 uppercase tracking-widest">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Preview Real-time</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Fontes Oficiais</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
