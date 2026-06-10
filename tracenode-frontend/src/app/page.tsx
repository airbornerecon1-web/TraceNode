'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { 
  Upload, 
  Settings, 
  Layers, 
  Activity, 
  Download, 
  Lock, 
  Unlock, 
  FileCode, 
  RefreshCw,
  Image as ImageIcon,
  Cpu,
  CreditCard,
  CheckCircle,
  XCircle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

function WorkspaceContent() {
  // States
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mode, setMode] = useState<'laser' | 'cnc'>('laser');
  const [threshold, setThreshold] = useState<number>(127);
  const [smoothing, setSmoothing] = useState<number>(50);
  const [blurIntensity, setBlurIntensity] = useState<number>(9);
  const [noiseReduction, setNoiseReduction] = useState<number>(3);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [checkoutLoading, setCheckoutLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const [rawSvg, setRawSvg] = useState<string>('');
  
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [downloadLocked, setDownloadLocked] = useState<boolean>(true);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);
  
  // Sandbox Simulator State
  const [isSandboxScreen, setIsSandboxScreen] = useState<boolean>(false);
  const [sandboxConversionId, setSandboxConversionId] = useState<string>('');
  const [sandboxLoading, setSandboxLoading] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse query parameters on load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const mockCheckout = params.get('mock_checkout');
    const success = params.get('success');
    const canceled = params.get('canceled');
    const conversionId = params.get('conversion_id');

    if (mockCheckout && conversionId) {
      // Show Stripe sandbox simulation screen
      setIsSandboxScreen(true);
      setSandboxConversionId(conversionId);
    } else if (success && conversionId) {
      // Successful payment checkout. Verify payment status from backend.
      verifyPaymentStatus(conversionId);
    } else if (canceled) {
      setError('Checkout cancelled. Complete the Stripe payment to unlock the download.');
      // Remove query parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch paid conversion and unlock
  const verifyPaymentStatus = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversion?id=${id}`);
      if (!res.ok) {
        throw new Error('Failed to verify payment status.');
      }
      const data = await res.json();
      if (data.status === 'paid') {
        setRawSvg(data.svg_content || '');
        setDownloadLocked(false);
        setPaymentSuccessMsg('Payment verified! Your high-res SVG download is now unlocked.');
        
        // Parse node count from SVG
        try {
          const match = data.svg_content.match(/<path/g);
          setNodeCount(match ? match.length : 12); // Fallback estimate
        } catch (e) {}
      } else {
        setError('Payment verification pending. Try refreshing if payment was completed.');
      }
    } catch (err: any) {
      setError(err.message || 'Error verifying transaction.');
    } finally {
      setLoading(false);
      // Remove query parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  // Debounced vector generation logic
  useEffect(() => {
    if (!imageFile) return;

    const delayDebounceFn = setTimeout(() => {
      triggerVectorization();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [mode, threshold, smoothing, blurIntensity, noiseReduction, imageFile]);

  // Handle file uploads
  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Unsupported file type. Please upload an image.');
      return;
    }
    setError(null);
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setRawSvg('');
    setNodeCount(null);
    setDownloadLocked(true); // Always lock download on new file upload
    setPaymentSuccessMsg(null);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Trigger Vectorization API Request
  const triggerVectorization = async () => {
    if (!imageFile) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('mode', mode);
    formData.append('threshold', (threshold / 255.0).toString());
    
    const mappedSmoothing = mode === 'laser' 
      ? ((smoothing / 100.0) * 1.3).toString()
      : (0.1 + (smoothing / 100.0) * 9.9).toString();
      
    formData.append('smoothing', mappedSmoothing);
    formData.append('blur_intensity', blurIntensity.toString());
    formData.append('noise_reduction', noiseReduction.toString());

    try {
      const response = await fetch('http://localhost:8000/api/vectorize', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to vectorize image.');
      }

      const data = await response.json();
      setRawSvg(data.svg_content || '');
      setNodeCount(data.node_count);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error communicating with vector server.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Download click (Triggers checkout or performs download)
  const handleDownloadClick = async () => {
    if (!rawSvg) return;

    if (downloadLocked) {
      // Trigger Stripe checkout process
      setCheckoutLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            svg_content: rawSvg,
            mode: mode,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to create payment checkout session.');
        }

        const data = await res.json();
        if (data.url) {
          // Redirect to Stripe checkout (or mock sandbox)
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL returned.');
        }
      } catch (err: any) {
        setError(err.message || 'Error initiating checkout.');
        setCheckoutLoading(false);
      }
    } else {
      // Download SVG directly
      const blob = new Blob([rawSvg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tracenode-${mode}-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // Simulate Sandbox Webhook callback
  const handleSimulateWebhookSuccess = async () => {
    setSandboxLoading(true);
    try {
      // Call local webhook API simulating Stripe event
      const res = await fetch('/api/webhook/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'checkout.session.completed',
          data: {
            object: {
              client_reference_id: sandboxConversionId,
              id: 'mock_stripe_sess_' + Math.random().toString(36).substring(7),
            }
          }
        }),
      });

      if (!res.ok) {
        throw new Error('Simulated webhook returned status ' + res.status);
      }

      // Redirect back with success status
      window.location.href = `/?success=true&conversion_id=${sandboxConversionId}`;
    } catch (err: any) {
      alert('Error simulating webhook: ' + err.message);
      setSandboxLoading(false);
    }
  };

  // Render Stripe Sandbox simulation portal
  if (isSandboxScreen) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-zinc-100 select-none">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
          
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400"></div>
          
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="inline-block px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-400 font-bold uppercase">
                Stripe Sandbox
              </span>
              <h2 className="text-lg font-mono font-bold tracking-tight text-zinc-100">
                SIMULATED BILLING GATEWAY
              </h2>
            </div>
            <CreditCard className="w-8 h-8 text-zinc-600 stroke-[1.2]" />
          </div>

          <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-850 font-mono text-xs space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-500">PRODUCT:</span>
              <span className="text-zinc-200">TraceNode SVG License</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">TRANS ID:</span>
              <span className="text-zinc-400 truncate max-w-[180px]">{sandboxConversionId}</span>
            </div>
            <div className="h-px bg-zinc-850 my-2"></div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400 font-semibold">TOTAL:</span>
              <span className="text-emerald-400 font-bold">$1.99 USD</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSimulateWebhookSuccess}
              disabled={sandboxLoading}
              className="w-full py-3 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] transition-all text-black font-mono font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              {sandboxLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-black" />
              ) : (
                <CheckCircle className="w-4 h-4 text-black" />
              )}
              Authorize Payment (Simulate Webhook)
            </button>

            <button
              onClick={() => { window.location.href = '/?canceled=true'; }}
              disabled={sandboxLoading}
              className="w-full py-3 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700/80 active:scale-[0.99] transition-all border border-zinc-750 text-zinc-400 font-mono text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <XCircle className="w-4 h-4 text-zinc-400" />
              Cancel Simulated Transaction
            </button>
          </div>

          <p className="text-[10px] font-mono text-zinc-500 text-center leading-relaxed">
            This checkout portal is active because no real Stripe credentials were configured. Webhooks are processed locally using mock signatures.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none overflow-x-hidden">
      
      {/* Header Banner */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/10">
            <Cpu className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-mono tracking-widest text-zinc-300 font-bold">
              TRACENODE <span className="text-cyan-400">//</span> VECTOR WORKSPACE
            </h1>
            <p className="text-[10px] font-mono text-zinc-500">v1.0.0 // STATUS: READY</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 font-mono text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>ENGINES: POTRACE + AUTOTRACE</span>
          </div>
          <div className="h-4 w-px bg-zinc-800"></div>
          <div className="hidden sm:block">HOST: localhost:8000</div>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Column: Control Panel */}
        <section className="w-full md:w-[420px] shrink-0 border-r border-zinc-800 bg-zinc-900/30 flex flex-col justify-between overflow-y-auto">
          
          <div className="p-6 space-y-6">
            
            {/* Component 1: File Drop Zone */}
            <div className="space-y-2">
              <label className="text-xs font-mono tracking-wider text-zinc-400 block uppercase">
                Input Source
              </label>
              
              <div 
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-all cursor-pointer min-h-[160px] text-center ${
                  isDragOver 
                    ? 'border-cyan-500 bg-cyan-950/20 text-cyan-400 scale-[0.98]' 
                    : imageFile 
                    ? 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/60' 
                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/20'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                  accept="image/*"
                />
                
                {imageFile ? (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mx-auto">
                      <FileCode className="w-5 h-5 text-cyan-400" />
                    </div>
                    <p className="text-xs font-medium max-w-[250px] truncate mx-auto text-zinc-200">
                      {imageFile.name}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-500">
                      {(imageFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-zinc-500 mx-auto" />
                    <p className="text-xs font-medium text-zinc-300">
                      Drag & Drop Image Here
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Supports PNG, JPG, BMP, WEBP
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Component 2: Mode Toggle */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono tracking-wider text-zinc-400 uppercase">
                  Vectorization Engine
                </label>
                <span className="text-[10px] font-mono text-zinc-500">
                  {mode === 'laser' ? 'POTRACE' : 'AUTOTRACE'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-850">
                <button
                  onClick={() => setMode('laser')}
                  className={`py-2 px-3 rounded text-xs font-mono font-medium transition-all ${
                    mode === 'laser'
                      ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-sm shadow-amber-950/20'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30 border border-transparent'
                  }`}
                >
                  Laser (Outline)
                </button>
                <button
                  onClick={() => setMode('cnc')}
                  className={`py-2 px-3 rounded text-xs font-mono font-medium transition-all ${
                    mode === 'cnc'
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-sm shadow-cyan-950/20'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30 border border-transparent'
                  }`}
                >
                  CNC (Centerline)
                </button>
              </div>
            </div>

            {/* Component 3: Threshold Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-zinc-500" />
                  <label className="text-xs font-mono text-zinc-300">
                    Binarize Threshold
                  </label>
                </div>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {threshold}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className={`w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-current ${
                  mode === 'laser' ? 'text-amber-500' : 'text-cyan-500'
                }`}
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-600">
                <span>0 (BLACK)</span>
                <span>127 (MID)</span>
                <span>255 (WHITE)</span>
              </div>
            </div>

            {/* Component 4: Smoothing Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-zinc-500" />
                  <label className="text-xs font-mono text-zinc-300">
                    Path Smoothing
                  </label>
                </div>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {smoothing}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={smoothing}
                onChange={(e) => setSmoothing(Number(e.target.value))}
                className={`w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-current ${
                  mode === 'laser' ? 'text-amber-500' : 'text-cyan-500'
                }`}
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-600">
                <span>CORNERS</span>
                <span>STANDARD</span>
                <span>SIMPLIFIED</span>
              </div>
            </div>

            {/* Component 5: Blur Intensity */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-zinc-500" />
                  <label className="text-xs font-mono text-zinc-300">
                    Blur Intensity (Bilateral)
                  </label>
                </div>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {blurIntensity}px
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                step="2"
                value={blurIntensity}
                onChange={(e) => setBlurIntensity(Number(e.target.value))}
                className={`w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-current ${
                  mode === 'laser' ? 'text-amber-500' : 'text-cyan-500'
                }`}
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-600">
                <span>1 (SHARP)</span>
                <span>9 (DEFAULT)</span>
                <span>15 (SMOOTH)</span>
              </div>
            </div>

            {/* Component 6: Noise Reduction / Gap Fill */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-zinc-500" />
                  <label className="text-xs font-mono text-zinc-300">
                    Noise Reduction / Gap Fill
                  </label>
                </div>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {noiseReduction}px
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={noiseReduction}
                onChange={(e) => setNoiseReduction(Number(e.target.value))}
                className={`w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-current ${
                  mode === 'laser' ? 'text-amber-500' : 'text-cyan-500'
                }`}
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-600">
                <span>1px (OFF)</span>
                <span>3px (CLOSE)</span>
                <span>10px (AGGRESSIVE)</span>
              </div>
            </div>

            {/* Node and Server Stats */}
            {(imageFile || paymentSuccessMsg) && (
              <div className="bg-zinc-900/60 border border-zinc-850 rounded-lg p-4 font-mono text-xs space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">PROCESSOR STATE:</span>
                  {loading ? (
                    <span className="text-cyan-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> RUNNING
                    </span>
                  ) : error ? (
                    <span className="text-rose-500">ERROR</span>
                  ) : (
                    <span className="text-emerald-400">SUCCESS</span>
                  )}
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">VECTOR NODES:</span>
                  {loading ? (
                    <span className="text-zinc-600 animate-pulse">CALCULATING...</span>
                  ) : nodeCount !== null ? (
                    <span className="text-sm font-bold text-zinc-200 border-b border-dashed border-zinc-700">
                      {nodeCount} nodes
                    </span>
                  ) : (
                    <span className="text-zinc-600">--</span>
                  )}
                </div>
                
                {paymentSuccessMsg && (
                  <div className="text-[10px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 p-2 rounded flex items-center gap-2 leading-relaxed mt-2 shadow-inner">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{paymentSuccessMsg}</span>
                  </div>
                )}

                {error && (
                  <div className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-950 p-2 rounded leading-relaxed mt-2">
                    {error}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Bottom Actions: High-Res download with payment integration */}
          <div className="p-6 border-t border-zinc-800/80 bg-zinc-900/40 space-y-4">
            
            <button
              onClick={handleDownloadClick}
              disabled={checkoutLoading || !rawSvg}
              className={`w-full py-3.5 px-4 rounded-lg font-mono font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-[0.99] ${
                !rawSvg
                  ? 'bg-zinc-900 border border-zinc-850 text-zinc-600 cursor-not-allowed'
                  : downloadLocked
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-500/10 cursor-pointer'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black shadow-lg shadow-emerald-500/10 cursor-pointer animate-pulse'
              }`}
            >
              {checkoutLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                  Initiating Checkout...
                </>
              ) : downloadLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-black" />
                  Unlock High-Res SVG ($1.99)
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-black" />
                  Download High-Res SVG
                </>
              )}
            </button>
            
            <div className="text-[9px] font-mono text-zinc-500 text-center leading-relaxed max-w-[280px] mx-auto">
              {downloadLocked 
                ? "This vector file is currently locked. Pay $1.99 via Stripe to unlock and download high-resolution output." 
                : "Vector purchase verified! Click the download button above to retrieve the high-res SVG."
              }
            </div>
            
          </div>
        </section>

        {/* Right Column: Canvas Preview Area */}
        <section className="flex-1 bg-zinc-950 flex flex-col overflow-hidden relative">
          
          {/* Canvas Header */}
          <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/20 flex items-center justify-between shrink-0 text-xs font-mono text-zinc-400">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-500" />
              <span>WORKSPACE CANVAS</span>
            </div>
            
            {loading && (
              <span className="flex items-center gap-2 text-cyan-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Processing Vision Filters...
              </span>
            )}
          </div>

          {/* Dual Panel Canvas Container */}
          <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
            
            {/* Panel Left: Original Image */}
            <div className="flex flex-col border border-zinc-850 rounded-lg bg-zinc-900/10 overflow-hidden min-h-[300px]">
              <div className="px-4 py-2 bg-zinc-900/40 border-b border-zinc-850 flex items-center justify-between shrink-0 font-mono text-[10px] text-zinc-500">
                <span>INPUT // ORIGINAL RASTER</span>
                <ImageIcon className="w-3.5 h-3.5 text-zinc-600" />
              </div>
              
              <div className="flex-1 flex items-center justify-center p-6 relative">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Original Upload"
                    className="max-h-[500px] w-auto max-w-full object-contain rounded border border-zinc-800 shadow-2xl"
                  />
                ) : (
                  <div className="text-center space-y-2 text-zinc-600">
                    <ImageIcon className="w-12 h-12 mx-auto stroke-[1.2] text-zinc-700" />
                    <p className="text-xs font-mono">No source image loaded.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Panel Right: Vector SVG Preview */}
            <div className="flex flex-col border border-zinc-850 rounded-lg bg-zinc-900/10 overflow-hidden min-h-[300px]">
              <div className="px-4 py-2 bg-zinc-900/40 border-b border-zinc-850 flex items-center justify-between shrink-0 font-mono text-[10px] text-zinc-500">
                <span>OUTPUT // VECTORIZED PREVIEW</span>
                <FileCode className="w-3.5 h-3.5 text-zinc-600" />
              </div>
              
              <div className="flex-1 flex items-center justify-center p-6 relative bg-dot-grid bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]">
                {loading && (
                  <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-20 rounded-b-lg">
                    <RefreshCw className="w-10 h-10 animate-spin text-cyan-500" />
                    <span className="font-mono text-xs text-cyan-400 font-bold uppercase tracking-wider animate-pulse">
                      Processing Vision Filters...
                    </span>
                  </div>
                )}
                
                {rawSvg ? (
                  <div className="relative group max-h-[500px] w-auto max-w-full flex items-center justify-center">
                    <div 
                      className="max-h-[500px] w-auto max-w-full flex items-center justify-center rounded border border-zinc-800 bg-zinc-900 p-2 shadow-2xl [&>svg]:max-h-[480px] [&>svg]:max-w-full [&>svg]:w-auto"
                      dangerouslySetInnerHTML={{ __html: rawSvg }}
                    />
                    {downloadLocked && (
                      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 rounded select-none">
                        <Lock className="w-8 h-8 text-amber-500 filter drop-shadow" />
                        <span className="font-mono text-[10px] bg-zinc-950/80 border border-zinc-800 text-zinc-400 py-1 px-2.5 rounded uppercase tracking-wider font-bold">
                          Watermarked Preview // Download Locked
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-2 text-zinc-600">
                    <FileCode className="w-12 h-12 mx-auto stroke-[1.2] text-zinc-700" />
                    <p className="text-xs font-mono">Awaiting vector compilation.</p>
                  </div>
                )}
              </div>
            </div>

          </div>

        </section>

      </main>

    </div>
  );
}

export default function Workspace() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 font-mono text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Initializing Workspace...
      </div>
    }>
      <WorkspaceContent />
    </Suspense>
  );
}
