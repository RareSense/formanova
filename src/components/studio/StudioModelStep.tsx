/**
 * StudioModelStep
 *
 * Pure render component for Step 2 of UnifiedStudio (choose / upload model or inspiration).
 *
 * WHY THIS EXISTS
 * ---------------
 * Extracted from UnifiedStudio.tsx (phase 32) to reduce the page file size.
 * It has NO internal state -- all values and callbacks are passed as props.
 *
 * WHAT IT RENDERS
 * ---------------
 * - Step 2 header (choose / upload model or inspiration)
 * - Hidden file input for model uploads
 * - Model preview canvas (left 2/3): selected model image or drop zone with silhouette SVGs
 * - Back / Generate actions row
 * - Model selection sidebar (right 1/3): My Models tab + FormaNova Models tab
 *
 * HOW TO USE
 * ----------
 * Rendered conditionally by UnifiedStudio when currentStep === 'model':
 *
 *   {currentStep === 'model' && (
 *     <StudioModelStep
 *       step2Ref={step2Ref}
 *       ...all other props...
 *     />
 *   )}
 */
import React from 'react';
import { motion } from 'framer-motion';
import {
  Diamond,
  X,
  Loader2,
  ArrowLeft,
  Lightbulb,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MasonryGrid } from '@/components/ui/masonry-grid';
import { ModelCard, type UserModel } from '@/components/studio/ModelCard';
import { PresetModelThumb } from '@/components/studio/PresetModelThumb';
import { type PresetModel } from '@/lib/models-api';
import { AspectRatioPill, ResolutionPill, type Resolution } from '@/components/studio/OutputSettingsPills';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

interface PresetCategory {
  id: string;
  label: string;
}

interface StudioModelStepProps {
  step2Ref: React.RefObject<HTMLDivElement>;
  modelInputRef: React.RefObject<HTMLInputElement>;
  isProductShot: boolean;
  user: { email?: string; id?: string } | null;
  activeModelUrl: string | null;
  resolvedActiveModelUrl: string | null;
  jewelryImage: string | null;
  preflightChecking: boolean;
  isModelUploading: boolean;
  customModelImage: string | null;
  selectedModel: PresetModel | null;
  isMyModelsEmptyState: boolean;
  myModelsSearch: string;
  mergedMyModels: UserModel[];
  activePresetCategories: PresetCategory[];
  formanovaCategory: string;
  activePresetLoading: boolean;
  activePresetError: boolean;
  activePresetEmpty: boolean;
  presetModelsForCategory: PresetModel[];
  setModelGuideOpen: (open: boolean) => void;
  setCurrentStep: (step: 'upload' | 'model' | 'generating' | 'results') => void;
  setSelectedModel: (model: PresetModel | null) => void;
  setCustomModelImage: (url: string | null) => void;
  setCustomModelFile: (file: File | null) => void;
  setModelAssetId: (id: string | null) => void;
  setMyModelsSearch: (search: string) => void;
  setFormanovaCategory: (cat: string) => void;
  aspectRatio: string;
  resolution: Resolution;
  generationCost: number;
  costLoading: boolean;
  onAspectRatioChange: (v: string) => void;
  onResolutionChange: (v: Resolution) => void;
  handleModelUpload: (file: File) => void;
  handleGenerate: () => void;
  handleDeleteUserModel: (id: string) => void;
  handleRenameUserModel: (id: string, newName: string) => void;
  handleSelectLibraryModel: (model: PresetModel) => void;
}

export function StudioModelStep({
  step2Ref,
  modelInputRef,
  isProductShot,
  user,
  activeModelUrl,
  resolvedActiveModelUrl,
  jewelryImage,
  preflightChecking,
  isModelUploading,
  customModelImage,
  selectedModel,
  isMyModelsEmptyState,
  myModelsSearch,
  mergedMyModels,
  activePresetCategories,
  formanovaCategory,
  activePresetLoading,
  activePresetError,
  activePresetEmpty,
  presetModelsForCategory,
  aspectRatio,
  resolution,
  generationCost,
  costLoading,
  onAspectRatioChange,
  onResolutionChange,
  setModelGuideOpen,
  setCurrentStep,
  setSelectedModel,
  setCustomModelImage,
  setCustomModelFile,
  setModelAssetId,
  setMyModelsSearch,
  setFormanovaCategory,
  handleModelUpload,
  handleGenerate,
  handleDeleteUserModel,
  handleRenameUserModel,
  handleSelectLibraryModel,
}: StudioModelStepProps) {
  return (
    <motion.div
      ref={step2Ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      {/* Step 2 Header */}
      <div className="mb-6">
        <span className="marta-label">Step 2</span>
        <h2 className="font-display text-3xl md:text-4xl uppercase tracking-tight mt-2">
          {isProductShot ? 'Choose or Upload Inspiration' : 'Choose or Upload Model'}
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {isProductShot ? 'Choose an inspiration from our library or upload your own' : 'Choose a model from our library or upload your own'}
        </p>
      </div>

      {/* Hidden file input for model uploads */}
      <input
        ref={modelInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleModelUpload(f); }}
      />

      {/* 2/3 + 1/3 split */}
      <div className="grid lg:grid-cols-3 gap-8 lg:gap-10 lg:items-start">
        {/* Left 2/3 — Model Preview Canvas */}
        <div className="lg:col-span-2 space-y-5">
          <div className="border border-border/30 bg-muted/5 h-[480px] md:h-[540px] flex items-center justify-center relative overflow-hidden">
            {activeModelUrl ? (
              <>
                <img
                  src={resolvedActiveModelUrl ?? undefined}
                  alt="Selected model"
                  className="max-w-full max-h-[520px] object-contain"
                />
                {!isProductShot && (
                  <button
                    type="button"
                    onClick={() => setModelGuideOpen(true)}
                    className="absolute top-3 right-12 flex items-center gap-1.5 border border-foreground/30
                               bg-muted px-2.5 py-1
                               font-mono text-[10px] tracking-widest uppercase
                               text-foreground hover:bg-foreground/10 hover:border-foreground/60
                               transition-colors z-10"
                  >
                    <Lightbulb className="h-3 w-3" />
                    View Guide
                  </button>
                )}
                <button
                  onClick={() => { setSelectedModel(null); setCustomModelImage(null); setCustomModelFile(null); setModelAssetId(null); }}
                  className="absolute top-3 right-3 w-7 h-7 bg-background/80 backdrop-blur-sm border border-border/40 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors z-10"
                  aria-label="Remove selected model"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <div
                className="text-center w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-foreground/[0.02] transition-colors relative"
                onClick={() => modelInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleModelUpload(f); }}
                onDragOver={(e) => e.preventDefault()}
              >
                {!isProductShot && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setModelGuideOpen(true); }}
                    className="absolute top-3 right-3 flex items-center gap-1.5 border border-foreground/30
                               bg-muted px-2.5 py-1
                               font-mono text-[10px] tracking-widest uppercase
                               text-foreground hover:bg-foreground/10 hover:border-foreground/60
                               transition-colors"
                  >
                    <Lightbulb className="h-3 w-3" />
                    View Guide
                  </button>
                )}
                {/* Model silhouette sketch -- theme-aware subtle fill */}
                {!isProductShot ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 100 100"
                    fill="currentColor"
                    className="w-64 h-[22rem] md:w-80 md:h-[28rem] text-muted-foreground/20 mb-6"
                  >
                    <path clipRule="evenodd" fillRule="evenodd" d="m44.9891 2.82079c-16.1035 4.07012-26.323 19.24461-24.6419 36.54261.3982 4.1143 1.5484 8.5826 2.1678 8.5826.2212 0 1.0617-.3096 1.9022-.6193h.0001l1.5485-.6637-.8406-3.2295c-.6636-2.5217-.7963-4.2028-.6636-7.6536.4424-8.273 3.318-15.1745 8.6711-20.5718 4.9107-4.9549 10.0868-7.43238 17.0768-8.18447 4.3356-.48665 7.2112 1.23873 3.0083 1.76962-13.803 1.76965-22.4298 9.02505-25.5267 21.50085-1.1502 4.7337-.7521 15.4399.6194 15.4399.5751 0 12.8297-3.4065 14.909-4.1586 6.1494-2.1678 12.1661-6.1494 16.9883-11.1928 5.5743-5.8398 7.7864-11.6353 7.3439-19.2446-.3096-5.75127-.7078-6.50335-4.2913-7.83057-4.1143-1.50417-13.2721-1.76961-18.2713-.48664zm11.2813 12.07761c.6194.9733.3982 1.1503-1.7253 1.3715-7.2555.8848-10.2638 2.1235-14.3782 5.9282-4.1143 3.8931-5.9282 7.5651-6.99 14.2012-.6636 4.0258-1.4157 3.3622-1.4157-1.1945 0-5.4858 2.4775-10.8389 6.8573-14.9975 3.7604-3.5393 7.2112-5.2204 12.2546-5.9282 2.8756-.354 4.9107-.1328 5.3973.6193zm16.7673-6.01666c.0884.17696.7963 1.54846 1.5926 3.00836 2.4332 4.6895 3.4065 8.6711 3.4065 14.1569.0443 7.2997-1.5926 12.5201-6.1936 19.5985-4.7338 7.3439-11.9007 13.4491-24.6862 21.1469-5.7955 3.4508-9.5559 7.1227-11.414 11.0601-2.7872 6.0167-1.5484 12.8298 3.0968 16.3248 2.8756 2.212 5.9725 3.0083 10.8832 2.7871 3.1853-.1327 4.5567-.4424 6.5918-1.3714 1.4157-.6636 2.5217-1.4157 2.4332-1.6812-.0885-.3097-1.0618-.7963-2.1678-1.106-2.389-.7078-5.3088-3.1411-6.3264-5.2204-.8848-1.8138-.929-4.6452-.1327-6.5918 1.0176-2.389 3.8489-4.424 11.1044-8.0517l6.9457-3.4508 4.1144.5309c6.6803.929 8.3614.0442 9.025-4.7337.2655-1.9024.7079-3.0969 1.4157-3.8489.6636-.7079.9291-1.3715.7521-2.0793-.177-.5752 0-1.283.4424-1.7697.5751-.6193.5751-1.0175.177-2.212-.4867-1.4157-.4867-1.5042 1.7254-3.3623 1.1944-1.0617 2.212-2.0793 2.212-2.2562 0-.177-1.0176-1.5042-2.2563-2.9199-.1678-.1929-.3281-.3765-.481-.5518-1.6539-1.8953-2.454-2.8122-2.7387-3.868-.2669-.9895-.0813-2.1011.2784-4.2542.0351-.2101.0718-.43.1099-.6607 1.0175-5.884.5309-11.3698-1.5926-17.2095-1.46-3.9817-5.6186-10.30805-7.5209-11.28134-.5309-.30968-.8848-.35392-.7963-.13272zm-11.5468 24.50916c5.8839-6.0167 8.7153-11.6794 9.1577-18.3155.1327-1.8581.3097-3.4065.3982-3.4065.4424 0 2.9199 5.6185 3.495 7.8305 1.3714 5.1762.5751 12.6086-1.9908 18.4925-1.3715 3.2296-5.4859 9.202-8.5827 12.4758-3.5835 3.8932-8.7153 7.7863-14.8648 11.4141-2.7871 1.6811-6.3263 3.8931-7.8305 4.9549-8.8923 6.2821-12.2989 15.8381-8.7154 24.3765.3539.8405.6194 1.6811.6194 1.9023 0 .7963-1.6369.3539-3.5835-.8848-2.8314-1.8139-4.9549-4.1144-6.4149-7.0342-1.1502-2.3005-1.2829-2.9199-1.2829-7.167s.1327-4.8664 1.3272-7.2997c.7078-1.4599 2.389-3.7161 3.6719-4.9991 2.6545-2.6102 5.3974-4.1144 12.6086-6.9015 8.4941-3.2738 13.0066-5.9282 17.6961-10.3523 2.3448-2.2562 3.0526-3.6719 2.1236-4.2471-.177-.1327-2.2121 1.1503-4.5126 2.8757-5.4858 4.1143-8.4056 5.707-15.8823 8.5826-3.4507 1.3715-7.3881 3.0526-8.7596 3.7162-5.0434 2.5659-8.8923 6.99-10.7061 12.4758-.8406 2.4332-.9733 3.4508-.7521 7.2112l.2212 4.3355-1.7254-1.6811c-.9733-.9733-2.5217-3.1853-3.4065-4.9549-1.3715-2.8314-1.5927-3.8047-1.7696-7.0785-.3097-6.1936 1.7696-11.0158 6.4148-15.1302 3.4508-3.0084 9.1578-5.4416 18.2713-7.7421 10.7947-2.7429 18.2713-6.813 24.7747-13.4491z" />
                  </svg>
                ) : !isProductShot ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 844 960"
                    fill="currentColor"
                    className="w-64 h-[22rem] md:w-80 md:h-[28rem] text-muted-foreground/20 mb-6"
                  >
                    <path d="m138 210.87c-17.42-2.42-50.24-6.99-65-15.22-4.71-2.62-9.28-6.72-12.95-10.65-11.46-12.31-8.44-26.77-2.85-41 9.71-24.68 37.59-54.5 64.8-58.72 1.32-0.15 2.67-0.23 4 0 14.3 1.84 2.4 16.41 10.3 25.62 4.1 4.77 14.44 9.17 20.7 10.05h9l11 1.01c16.1-0.57 31.32-5.44 46-11.83l12-5.7 30-11.01s33-9 33-9c28.74-7.99 57.54-14.15 87-18.69 13.29-2.05 33.92-5.71 47-5.73h18l21-1.78h15l40 2.78c20.63 0.25 59.65 7.9 79 15.19 18.6 7.01 39.67 15.85 56 27.25l14.96 12.19c11.73 9.9 17.08 14.97 25.12 28.28 7.22 11.95 13.94 25.76 13.91 40.09l-1.03 8.42v5.58c-0.19 4.01-1.81 8.14-2.96 12 5.98 0.49 9.3 1.55 14.96 3.13 16.95 4.75 22.6 9.48 35.04 21.87 5.66 5.64 10.06 9.98 14.13 17 10.57 18.27 16.03 42.23 18.87 63 3.3 24.17 0.2 49.22-4.55 73-9.76 48.87-25.98 91.83-56.08 132.01 0 0-6.73 9.57-6.73 9.57-5.65 7.21-21.24 22.28-28.64 27.92l-15 9.5 38-3.43c4.18-0.6 12.13-2.79 15.36 0.99 2.53 2.97-2.42 14.82-3.67 18.44l-4.57 15c-4.08 12.46-7.52 23.06-10.12 36l-4-1s19-65 19-65c-25.33 1.16-50.26 6.72-75 11.88 0 0-33 7.27-33 7.27s-23 6.97-23 6.97l-13 3.59-16 6.86c-23.25 9.92-45.65 21.07-68 32.88l-41 22c-19.79 11.71-52.06 34.06-70 48.36l-29 24.9-19.17 16.61-21.82 21.68-21.91 24c-3 3.35-4.29 6.71-8.1 9 6.89-16.51 24.3-34.3 37-47l51-48.73 36-28.27c-11.26-9.39-16.66-24.67-16.99-39-0.16-7.29 1.72-22.15 4.09-29 2.42-7 6.52-12.84 10.47-19 11.87-18.55 30.49-36.56 52.42-42.36 0 0 5.43-0.66 5.43-0.66l5.3-1.46 14.28-1.51s24 2.56 24 2.56c3.29-0.24 10.27-4.23 13-6.2 5.34-3.87 8.11-8.32 12.01-13.37 10.95-14.18 19.52-32.9 20.81-51 0.37-5.17-2.2-20.2-4.33-25-1.02-2.29-2.83-5.88-5.53-6.42-2.6-0.52-8.36 3.75-10.96 5.05-4.81 2.41-18.83 7.67-24 8.77-16.92 3.58-22.07 3.63-39 3.6-23.14-0.04-58.74-14.17-73.68-32-3.27-3.91-8.59-12.23-10.37-17-2.64-7.05-5.92-29.34-5.92-37l1.11-10v-8l2.85-10c2.01-8.8 8.92-26.99 18.01-30-0.55 6.79-1.09 6.12-1 14 0.14 12.12 5.79 25.08 14.46 33.63l7.54 5.97c17.83 14 40.77 19.93 63 21.49l12 0.91 25-1 27-2c33.6-0.05 63.51-1.47 88.96 25 5.36 5.58 5.52 7.68 9.04 14-3.37-23.86-29.45-37.15-50-44.46-14.77-5.26-35.39-5.8-51-6.08h-13c-24.42 0.69-60.5-3.22-83-12.74-23.03-9.75-44.26-28.39-34.19-55.72 2.45-6.66 8.74-15.53 13.33-21 6.05-7.21 11.5-13.16 19.86-17.82l9-5.18h-13c-9.94-0.02-20.16-2.14-30-3.57-19.12-2.78-37.88-6.92-56-13.89 0 0-14-6.03-14-6.03l-11-6.07-13-6.11c-14.34-7.94-36.86-26.12-45.05-40.33-1.53-2.66-5.07-11.9-5.95-15-8.37 6.02-20.17 24.16-26.42 33-17.76 25.1-32.54 56.77-38.58 87-1.76 8.78-4.32 20.11-3.92 29 0.46 10.12 1.93 18.16 3.83 28l8.17 37c0.69 4.19 0.27 11.73 4.07 13.98 1.78 1.06 4.77 1.04 6.85 1.5 5.49 0.5 14.41 3.54 19 0 6.5-4.55 8.68-11.94 16-15.48l-11 21 26 10.3c2.17 0.99 7.84 3.28 8.95 5.25 2.08 3.69-4.46 9.98-6.96 12.13-5.24 4.49-16.13 12.15-22.99 13.01-3.37 0.42-7.44-0.53-11-0.69 1.99-6.64 6.56-7.4 6.34-11.99-0.19-4.1-5.11-5.76-8.34-6.96-10.12-3.73-16.41-4.87-26-11.05l-5.51 13c-10.86 19.63-29.3 33.96-47.49 46.34-6.74 4.59-15.95 12.54-24 13.66 3.05-5.45 16.34-12.75 22-16.72 12.99-9.12 30.59-22.79 40.1-35.28 2.97-3.9 11.7-15.25 11.4-19.96-0.22-3.42-4.07-5.37-6.32-7.5-2.66-2.53-3.6-4.33-5.18-7.54l13-3-2.47-15c-3.58-14.38-12.39-34.45-13.53-48-7.98 9.34-14.63 16.59-26 22.02-5.01 2.39-10.61 3.49-16 4.64-36.61 7.83-68.94-7.06-91.11-36.66-8.17-10.92-16.72-27.11-16.89-41-0.12-10.95 3.8-30.28 8.66-40 3.27-6.55 9.91-14.54 15.38-19.42 4.2-3.75 8.9-7.71 13.96-10.24 2.31-1.17 5.31-2.46 7.37 0 1.62 2.1 0.55 5.33 0 7.66-1.05 5.21-2.02 11.68-1.79 17 0.13 2.98 0.87 8.22 1.83 11 5.77 16.79 22.89 16 37.59 16l-1-15c0.07-16.56 8.11-33.39 17-47 0 0-17-2.13-17-2.13zm579-36.87l-1 1v-1h1zm1 12l-2-5 2 5zm-394 170.04c-5.49-5.26-14.36-11.51-21-15.3-2.48-1.41-7.21-4.01-10-4.23-3.78-0.3-11.38 4.81-15 6.79l-21 11.18-14 7.74c-2.93 1.39-15.44 7.95-17.64 4.2-1.84-3.12 3.41-9.16 5.26-11.42 7.42-9.07 16.79-15.66 27.38-20.58 8.18-3.8 20.87-8.93 30-8.24 14.97 1.14 27.65 12.14 37.15 22.82 5.56 6.24 9.01 7.71 11.85 16l-1 1c-5.19-1.93-8.05-6.18-12-9.96zm-177 141.96c0 13.05 3.54 19.67 13.04 28.91 6.42 6.25 11.8 8.48 16.6 17.09 3.36 6.04 5.1 18.82-1.64 23 1.19-7.75 3.24-10.26-1.07-18-5.23-9.39-12.06-11.86-18.89-18.18-8.2-7.58-14.52-21.96-10.04-32.82h2zm51.98 30.73c2.45 1.62 5.46 4.91 4.36 8.12-0.69 2.04-2.4 2.65-4.36 2l-6.98-4.44c-4.28-2.3-9.2-3.19-14-3.41 2.51-6.97 15.84-5.65 20.98-2.27zm-28.98 53.27c-0.03-2.67-0.59-9.26 1.6-10.98 3.28-2.56 11.05 1.24 14.4 2.58 17.94 7.18 22.42 12.03 38 21.59l15.57 7.95c1.07 0.81 1.64 1.65 1.96 2.97 0.7 2.86-1.19 7.11-2.11 9.89-3.33 10.07-6.32 12.98-14.42 19.28-3.13 2.44-4.99 4.22-9 5.19-10.02 2.43-20.7-3.07-19.81-14.47 0.53-6.85 3.61-10.99 5.81-17-15.17-1.27-31.77-9.91-32-27zm180.99 219s16.3-17.75 16.3-17.75l18.29-16.53c14.64-14.71 40.05-32.85 57.42-45.14l40-25.9 15-9.37 61-29.62c20.03-9.19 40.07-18.23 61-25.2 0 0 23-7.58 23-7.58l48-12.03c7.74-1.83 21.14-6.87 28-2.88l-28 6.89s-31 7.74-31 7.74s-28 7.4-28 7.4c-18.48 5.85-44.11 17.45-62 25.66l-25 10.57s-14 7.48-14 7.48l-14 6.89-42 25.26c-22.34 14.85-44.17 30.45-65 47.42l-25 22.52-7.72 6.61s-29.24 29.56-29.24 29.56c-4.71 4.93-7.23 10-14.04 12 2.18-9.14 10.61-17.46 16.99-24zm-136.85-108c7.03 17.44 37.31 16.18 52.86 16l9-1.06h10c19.04-2.71 50.21-11.55 68-18.95 9.92-4.13 25.22-14.5 35-14.99-3.11 6.44-9.89 10.44-16 13.77-11.2 6.11-14.82 8.07-27 12.31l-34 12c-17.88 4.77-31.65 5.95-50 5.92-6.06-0.01-12.01-0.87-18-1.73-14.02-2.01-29.36-5.96-34.08-21.27-2-6.13-0.43-13.74 0-20h3.08c-0.56 6.96-1.69 10.96 1.14 18zm50.86 196.14c-16.64 9.78-45.58 28.04-65 28.82-2.72 0.11-5.43 0.03-8-0.95-5.68-2.16-16.05-11.37-18.29-17.02-3.36-8.51-2.81-16.06-2.71-24.99 0.11-8.8 3.84-24.51 6.67-33 13.24-39.76 35.43-62.02 69.33-85.35 20.86-14.35 20.51-15.49 45-23.65 0.72 7.49-4.12 10.35-9 15.04-5.02 4.83-9.47 9.61-13.92 14.96-9.47 11.39-17.43 26.73-21.64 41l-2.48 12c-1.35 5.71-3.14 9.76-3.64 16l0.8 9v10c1.51 10.27 8.22 25 18.88 28.2 12.42 3.73 20.02-11.23 31-10.2-5.03 6.65-19.55 15.76-27 20.14zm-31-118.49l-11.96 9.52c-9.97 9.31-27.72 33.09-32.57 45.83-2.63 6.89-6.46 30.27-6.47 38-0.02 10.33-0.71 27.54 2.36 37 2.08 6.41 4.16 11.53 11.64 11.96 8.66 0.49 14.4-2.74 22-6.1l43-22.86c-3.97-4.22-6.45-4.05-11-6.96-5.45-3.48-10.71-8.51-14.07-14.04-16.82-27.63-2.29-67.31 12.41-93l10.66-16c-7.7 2.82-19.25 11.5-26 16.65z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 64 64"
                    fill="currentColor"
                    className="w-48 h-48 md:w-64 md:h-64 text-muted-foreground/20 mb-6"
                  >
                    <path d="m56.55566 6.74023h-49.11181a3.44767 3.44767 0 0 0 -3.44385 3.44336v43.63282a3.44856 3.44856 0 0 0 3.44385 3.44336h49.11181a3.44778 3.44778 0 0 0 3.44434-3.44336v-43.63282a3.44778 3.44778 0 0 0 -3.44434-3.44336zm-50.55566 47.07618c.0268-.25279-.049-43.66716.02484-43.87824l3.24945 2.78674a2.59929 2.59929 0 0 0 -.27087 1.14032v36.26954a2.59739 2.59739 0 0 0 .15668.861l-3.147 2.94952c-.00394-.04313-.0131-.08476-.0131-.12888zm5.00342-3.68164v-9.3703l8.90283-9.41779a2.25909 2.25909 0 0 1 3.28027-.00293l6.1128 6.51074a3.46349 3.46349 0 0 0 5.2456-.2647l7.71582-10.082a2.27043 2.27043 0 0 1 3.624-.00093l7.11233 9.55814v13.06977a.63017.63017 0 0 1 -.62988.62988h-40.73438a.63006.63006 0 0 1 -.62939-.62988zm36.48681-23.82129a4.28242 4.28242 0 0 0 -6.82519-.01066l-7.70804 10.07218a1.4568 1.4568 0 0 1 -2.19971.11032l-6.11523-6.51266a4.27709 4.27709 0 0 0 -6.189 0l-7.44971 7.88135v-23.98878a.63006.63006 0 0 1 .62939-.62988h40.73445a.63017.63017 0 0 1 .62988.62988v19.84882zm5.82618-14.894a2.60615 2.60615 0 0 0 -.94922-.18414h-40.73438a2.59635 2.59635 0 0 0 -.84662.15228l-3.08642-2.64739h48.653zm-42.82776 41.072a2.59748 2.59748 0 0 0 1.14416.27313h40.73438a2.61257 2.61257 0 0 0 1.03418-.2132l2.99663 2.70836h-48.86272zm44.31311-1.37148a2.61046 2.61046 0 0 0 .19531-.98523v-36.26954a2.608 2.608 0 0 0 -.22717-1.05981l3.20892-2.83148a1.42315 1.42315 0 0 1 .02118.20965c-.02448.26559.03921 43.58836-.018 43.81063z"/>
                    <path d="m18.00391 16.30273a3.67991 3.67991 0 0 0 .00011 7.35938 3.67991 3.67991 0 0 0 -.00011-7.35938zm0 5.35938a1.67986 1.67986 0 0 1 .00007-3.35937 1.67986 1.67986 0 0 1 -.00007 3.35937z"/>
                  </svg>
                )}
                <p className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground/60">
                  {isProductShot ? 'Selected or uploaded inspiration will appear here' : 'Selected or uploaded model will appear here'}
                </p>
              </div>
            )}
          </div>

          {/* Desktop/tablet action bar (md+): Back · [Frame] [Res] · Generate */}
          <div className="hidden md:flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setCurrentStep('upload')}
              className="gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <AspectRatioPill value={aspectRatio} onChange={onAspectRatioChange} />
              <ResolutionPill value={resolution} onChange={onResolutionChange} />
              <Button
                size="lg"
                onClick={handleGenerate}
                disabled={!jewelryImage || !activeModelUrl || preflightChecking || isModelUploading}
                className="gap-2.5 font-display text-lg uppercase tracking-wide bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] text-background hover:opacity-90 transition-opacity border-0 disabled:opacity-40 disabled:from-muted disabled:to-muted disabled:text-muted-foreground"
              >
                {isModelUploading ? 'Uploading…' : 'Generate Photoshoot'}
                {preflightChecking || isModelUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <span className={`flex items-center gap-1 text-sm font-mono normal-case tracking-normal transition-opacity ${costLoading ? 'opacity-30' : 'opacity-70'}`}>
                    <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" /> {generationCost}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Spacer so content clears the mobile sticky bar */}
          <div className="md:hidden h-44" />
        </div>

        {/* Right 1/3 -- Model Selection Sidebar */}
        <div className="flex flex-col">
        <div className="h-[480px] md:h-[540px] flex flex-col">
          <Tabs defaultValue="formanova" className="w-full flex-1 flex flex-col min-h-0">
            <TabsList className="w-full grid grid-cols-2 mb-3 bg-muted/30 h-11 flex-shrink-0">
              <TabsTrigger value="my-models" className="font-mono text-[10px] uppercase tracking-[0.15em] data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:text-muted-foreground transition-all">
                {isProductShot ? 'My Inspirations' : 'My Models'}
              </TabsTrigger>
              <TabsTrigger value="formanova" className="font-mono text-[10px] uppercase tracking-[0.15em] data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:text-muted-foreground transition-all">
                {isProductShot ? 'FormaNova Inspirations' : 'FormaNova Models'}
              </TabsTrigger>
            </TabsList>

            {/* MY MODELS TAB */}
            <TabsContent value="my-models" className="flex-1 flex flex-col min-h-0 mt-0 space-y-0">

              {isMyModelsEmptyState ? (
                <button
                  onClick={() => modelInputRef.current?.click()}
                  className="flex-1 w-full border border-dashed border-border/30 bg-muted/5 hover:bg-muted/10 hover:border-foreground/20 transition-all duration-300 flex flex-col items-center justify-center gap-5 group/empty"
                >
                  {/* Pulsing diamond */}
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2.5s' }} />
                    <div className="absolute inset-[-6px] rounded-full bg-primary/5 animate-ping" style={{ animationDuration: '3.5s', animationDelay: '0.8s' }} />
                    <div className="absolute inset-0 rounded-full bg-muted/30 border-2 border-primary/20 flex items-center justify-center group-hover/empty:border-primary/40 transition-colors duration-300">
                      <Diamond className="h-9 w-9 text-primary group-hover/empty:scale-110 transition-transform duration-300" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/70 group-hover/empty:text-foreground transition-colors">
                      {isProductShot ? 'Upload Your Inspiration' : 'Upload Your Model'}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                      Saved here for future shoots
                    </span>
                  </div>
                </button>
              ) : (
                <>
                {/* Search */}
                <div className="relative mb-2 flex-shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Type a model name…"
                    value={myModelsSearch}
                    onChange={e => setMyModelsSearch(e.target.value)}
                    className="w-full bg-muted/20 border border-border/20 pl-7 pr-3 py-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border/60 transition-colors"
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  <MasonryGrid columns={3} gap={12}>
                    {/* Upload card -- always first */}
                    <div className="flex flex-col">
                      <button
                        onClick={() => modelInputRef.current?.click()}
                        className="group/upload relative aspect-[3/4] w-full overflow-hidden border border-dashed border-border/30 transition-all flex flex-col items-center justify-center gap-2 hover:border-foreground/30 hover:bg-foreground/[0.02]"
                      >
                        <div className="relative w-14 h-14">
                          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2.5s' }} />
                          <div className="absolute inset-0 rounded-full bg-primary/5 flex items-center justify-center border-2 border-primary/20">
                            <Diamond className="h-7 w-7 text-primary" />
                          </div>
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider text-center px-1">
                          Upload
                        </span>
                      </button>
                      {/* Reserve naming-row height for grid alignment */}
                      <div className="h-10 sm:h-11" />
                    </div>

                    {/* User-uploaded models */}
                    {mergedMyModels.filter(m => !myModelsSearch || m.name.toLowerCase().includes(myModelsSearch.toLowerCase())).map((model) => {
                      const isActive = customModelImage === model.url;
                      return (
                        <ModelCard
                          key={model.id}
                          model={model}
                          isActive={isActive}
                          onSelect={() => { setCustomModelImage(model.url); setSelectedModel(null); setCustomModelFile(null); setModelAssetId(model.id.startsWith('user-') ? null : model.id); }}
                          onDelete={() => handleDeleteUserModel(model.id)}
                          onRename={(newName) => handleRenameUserModel(model.id, newName)}
                        />
                      );
                    })}
                  </MasonryGrid>
                </div>
                </>
              )}
            </TabsContent>

            {/* FORMANOVA MODELS TAB */}
            <TabsContent value="formanova">
              <div className="h-[420px] md:h-[480px] overflow-y-auto pr-1">
                {/*
                  CSS columns layout: content flows top-to-bottom in each column before
                  moving to the next. Category buttons anchor to the top of column 1,
                  and images fill the remaining space below them and in columns 2 & 3.
                */}
                <div className="columns-3 gap-2">
                  {/* Category buttons */}
                  {activePresetCategories.map((cat) => (
                    <div key={cat.id} className="break-inside-avoid mb-2">
                      <button
                        onClick={() => setFormanovaCategory(cat.id)}
                        className={`w-full px-3 py-3 text-center transition-all duration-200 ${
                          formanovaCategory === cat.id
                            ? 'bg-foreground text-background'
                            : 'bg-transparent text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5'
                        }`}
                      >
                        <span className="block font-mono text-[10px] uppercase tracking-[0.12em] leading-tight">
                          {cat.label}
                        </span>
                      </button>
                    </div>
                  ))}
                  {/* Model thumbnails */}
                  {activePresetLoading ? (
                    <div className="break-inside-avoid mb-2 col-span-full">
                      <div className="border border-border/20 p-4 text-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50 mx-auto mb-3" />
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          Loading Formanova models
                        </p>
                      </div>
                    </div>
                  ) : activePresetError ? (
                    <div className="break-inside-avoid mb-2 col-span-full">
                      <div className="border border-border/20 p-4 text-center">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          Formanova models are unavailable
                        </p>
                      </div>
                    </div>
                  ) : activePresetEmpty ? (
                    <div className="break-inside-avoid mb-2 col-span-full">
                      <div className="border border-border/20 p-4 text-center">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          No Formanova models found
                        </p>
                      </div>
                    </div>
                  ) : (
                    presetModelsForCategory.map((model) => {
                      const catLabel = activePresetCategories.find(c => c.id === formanovaCategory)?.label ?? '';
                      const isPlain = catLabel.toLowerCase() === 'plain';
                      return (
                        <PresetModelThumb
                          key={model.id}
                          model={model}
                          isSelected={selectedModel?.id === model.id && !customModelImage}
                          onSelect={() => handleSelectLibraryModel(model)}
                          fixedAspect={isPlain}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        </div>
      </div>

      {/* Mobile sticky action bar (<md): 2-col pills + full-width CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/20 px-4 pt-3 pb-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <AspectRatioPill value={aspectRatio} onChange={onAspectRatioChange} className="w-full justify-center" />
          <ResolutionPill value={resolution} onChange={onResolutionChange} className="w-full justify-center" />
        </div>
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={!jewelryImage || !activeModelUrl || preflightChecking || isModelUploading}
          className="w-full gap-2.5 font-display text-lg uppercase tracking-wide bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] text-background hover:opacity-90 transition-opacity border-0 disabled:opacity-40 disabled:from-muted disabled:to-muted disabled:text-muted-foreground"
        >
          {isModelUploading ? 'Uploading…' : 'Generate Photoshoot'}
          {preflightChecking || isModelUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span className="flex items-center gap-1 opacity-70 text-sm font-mono normal-case tracking-normal">
              <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" /> {generationCost}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentStep('upload')}
          className="gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground w-full"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
      </div>
    </motion.div>
  );
}
