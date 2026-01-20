/**
 * StoryboardGeneratorModal.tsx
 * 
 * Modal overlay for creating AI-powered storyboard scenes.
 * Multi-step workflow: Character Selection → Story Input → Script Review → Generate
 */

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Loader2, Film, Users, PenTool, Sparkles, Check, Edit3, Wand2, Eye } from 'lucide-react';
import { CharacterAsset, SceneScript, StoryboardState } from '../../hooks/useStoryboardGenerator';

// ============================================================================
// IMAGE MODELS (Copied from NodeControls.tsx for model selection)
// ============================================================================

const IMAGE_MODELS = [
    { id: 'gpt-image-1.5', name: 'GPT Image 1.5', provider: 'openai' },
    { id: 'gemini-pro', name: 'Nano Banana Pro', provider: 'google' },
    { id: 'kling-v1-5', name: 'Kling V1.5', provider: 'kling' },
    { id: 'kling-v2-1', name: 'Kling V2.1', provider: 'kling' },
];

// ============================================================================
// TYPES
// ============================================================================

interface StoryboardGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    state: StoryboardState;
    onSetStep: (step: StoryboardState['step']) => void;
    onToggleCharacter: (character: CharacterAsset) => void;
    onSetSceneCount: (count: number) => void;
    onSetStory: (story: string) => void;
    onUpdateScript: (index: number, updates: Partial<SceneScript>) => void;
    onGenerateScripts: () => Promise<void>;
    onBrainstormStory: () => Promise<void>;
    onOptimizeStory: () => Promise<void>;
    onGenerateComposite: () => Promise<void>;
    onRegenerateComposite: () => Promise<void>;
    onCreateNodes: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const StoryboardGeneratorModal: React.FC<StoryboardGeneratorModalProps> = ({
    isOpen,
    onClose,
    state,
    onSetStep,
    onToggleCharacter,
    onSetSceneCount,
    onSetStory,
    onUpdateScript,
    onGenerateScripts,
    onBrainstormStory,
    onOptimizeStory,
    onGenerateComposite,
    onRegenerateComposite,
    onCreateNodes
}) => {
    const [characterAssets, setCharacterAssets] = useState<CharacterAsset[]>([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [editingScriptIndex, setEditingScriptIndex] = useState<number | null>(null);


    // Step definitions for progress bar
    const stepDefinitions = [
        { id: 'characters', label: 'Characters', icon: Users },
        { id: 'story', label: 'Story', icon: PenTool },
        { id: 'scripts', label: 'Scripts', icon: Film },
        { id: 'preview', label: 'Preview', icon: Eye },
        { id: 'generate', label: 'Generate', icon: Sparkles }
    ];

    const currentStepIndex = stepDefinitions.findIndex(s => s.id === state.step);


    // Auto-generate preview when entering preview step
    useEffect(() => {
        if (state.step === 'preview' && !state.compositeImageUrl && !state.isGeneratingPreview) {
            onGenerateComposite();
        }
    }, [state.step, state.compositeImageUrl, state.isGeneratingPreview, onGenerateComposite]);


    // Fetch character assets from library
    useEffect(() => {
        if (!isOpen) return;

        const fetchAssets = async () => {
            setIsLoadingAssets(true);
            try {
                const response = await fetch('/api/library');
                if (response.ok) {
                    const assets = await response.json();
                    // Filter to only Character category
                    const characters = assets
                        .filter((a: any) => a.category === 'Character')
                        .map((a: any) => ({
                            id: a.id,
                            name: a.name,
                            url: a.url,
                            description: a.description || ''
                        }));
                    setCharacterAssets(characters);
                }
            } catch (error) {
                console.error('[StoryboardModal] Failed to fetch assets:', error);
            } finally {
                setIsLoadingAssets(false);
            }
        };

        fetchAssets();
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Modal */}
            <div className="relative bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-neutral-800 flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Film size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Storyboard Generator</h2>
                            <p className="text-xs text-neutral-400">Create scenes with AI</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-neutral-400" />
                    </button>
                </div>

                {/* Step Indicator */}
                <div className="px-6 py-3 border-b border-neutral-800 flex items-center gap-2">
                    {stepDefinitions.map((step, index) => {
                        // Determine if step is accessible
                        let isAccessible = false;
                        if (index <= currentStepIndex) isAccessible = true; // Always allow current/previous
                        else if (step.id === 'scripts' && state.scripts.length > 0) isAccessible = true;
                        else if ((step.id === 'preview' || step.id === 'generate') && state.compositeImageUrl) isAccessible = true;

                        return (
                            <React.Fragment key={step.id}>
                                <button
                                    onClick={() => isAccessible && onSetStep(step.id as StoryboardState['step'])}
                                    disabled={!isAccessible}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all ${index === currentStepIndex
                                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50 cursor-default'
                                        : isAccessible
                                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer'
                                            : 'bg-neutral-800 text-neutral-500 opacity-50 cursor-not-allowed'
                                        }`}
                                >
                                    {isAccessible && index < currentStepIndex ? (
                                        <Check size={12} />
                                    ) : (
                                        <step.icon size={12} />
                                    )}
                                    <span className="hidden sm:inline">{step.label}</span>
                                </button>
                                {index < stepDefinitions.length - 1 && (
                                    <ChevronRight size={14} className="text-neutral-600" />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Error Message */}
                    {state.error && (
                        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
                            {state.error}
                        </div>
                    )}

                    {/* Step 1: Character Selection */}
                    {state.step === 'characters' && (
                        <div>
                            <h3 className="text-white font-medium mb-2">Select Characters</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                Choose up to 3 characters from your Asset Library. Characters with "Character" category will appear here.
                            </p>

                            {isLoadingAssets ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                                </div>
                            ) : characterAssets.length === 0 ? (
                                <div className="text-center py-12 text-neutral-500">
                                    <Users size={48} className="mx-auto mb-3 opacity-50" />
                                    <p>No characters found in Asset Library</p>
                                    <p className="text-xs mt-1">Add assets with category "Character" to use them here</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-3">
                                    {characterAssets.map(character => (
                                        <button
                                            key={character.id}
                                            onClick={() => onToggleCharacter(character)}
                                            className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${state.selectedCharacters.some(c => c.id === character.id)
                                                ? 'border-purple-500 ring-2 ring-purple-500/30'
                                                : 'border-neutral-700 hover:border-neutral-500'
                                                }`}
                                        >
                                            <img
                                                src={character.url}
                                                alt={character.name}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                                <p className="text-white text-xs font-medium truncate">
                                                    {character.name}
                                                </p>
                                            </div>
                                            {state.selectedCharacters.some(c => c.id === character.id) && (
                                                <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                                                    <Check size={14} className="text-white" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <p className="text-xs text-neutral-500 mt-4">
                                Selected: {state.selectedCharacters.length}/3 characters (optional)
                            </p>
                        </div>
                    )}

                    {/* Step 2: Story Input */}
                    {state.step === 'story' && (
                        <div>
                            <h3 className="text-white font-medium mb-2">Write Your Story</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                Describe the story you want to visualize. AI will break it into {state.sceneCount} scenes.
                            </p>

                            {/* Scene Count Slider */}
                            <div className="mb-4">
                                <label className="block text-sm text-neutral-300 mb-2">
                                    Number of Scenes: <span className="text-purple-400 font-medium">{state.sceneCount}</span>
                                </label>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={state.sceneCount}
                                    onChange={(e) => onSetSceneCount(parseInt(e.target.value))}
                                    className="w-full accent-purple-500"
                                />
                                <div className="flex justify-between text-xs text-neutral-500 mt-1">
                                    <span>1</span>
                                    <span>10</span>
                                </div>
                            </div>

                            {/* Brainstorm with AI Button */}
                            <button
                                onClick={onBrainstormStory}
                                disabled={state.isBrainstorming}
                                className="mb-3 flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors group"
                            >
                                {state.isBrainstorming ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Brainstorming...</span>
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={14} className="group-hover:rotate-12 transition-transform" />
                                        <span className="underline decoration-dashed underline-offset-2">Brainstorm with AI</span>
                                        <span className="text-neutral-500 text-xs">(let AI write a story for you)</span>
                                    </>
                                )}
                            </button>

                            {/* Story Textarea */}
                            <textarea
                                value={state.story}
                                onChange={(e) => onSetStory(e.target.value)}
                                placeholder="Once upon a time, in a magical forest..."
                                className="w-full h-48 bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white text-sm resize-none focus:outline-none focus:border-purple-500 placeholder-neutral-500"
                            />
                            <div className="flex justify-between items-start mt-2">
                                <p className="text-xs text-neutral-500">
                                    Tip: Be descriptive about scenes, actions, and emotions for better results.
                                </p>
                                <button
                                    onClick={onOptimizeStory}
                                    disabled={state.isOptimizing || !state.story.trim()}
                                    className={`text-xs flex items-center gap-1.5 transition-colors ${state.story.trim() ? 'text-purple-400 hover:text-purple-300' : 'text-neutral-600 cursor-not-allowed'
                                        }`}
                                >
                                    {state.isOptimizing ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Wand2 size={12} />
                                    )}
                                    Optimize with AI
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Script Review */}
                    {state.step === 'scripts' && (
                        <div>
                            <h3 className="text-white font-medium mb-2">Review & Edit Scripts</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                AI generated {state.scripts.length} scene scripts. Click to edit.
                            </p>

                            <div className="space-y-3">
                                {state.isGenerating ? (
                                    // SKELETON LOADERS
                                    Array.from({ length: state.sceneCount }).map((_, i) => (
                                        <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 relative overflow-hidden">
                                            {/* Shimmer Effect */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent animate-[pulse_2s_infinite]" />

                                            <div className="flex items-center justify-between mb-3">
                                                <div className="h-4 w-20 bg-neutral-800/50 rounded animate-pulse" />
                                                <div className="flex gap-2">
                                                    <div className="h-4 w-16 bg-neutral-800/50 rounded animate-pulse" />
                                                    <div className="h-4 w-16 bg-neutral-800/50 rounded animate-pulse" />
                                                </div>
                                            </div>

                                            <div className="space-y-2 mb-2">
                                                <div className="h-3 w-full bg-neutral-800/50 rounded animate-pulse" />
                                                <div className="h-3 w-5/6 bg-neutral-800/50 rounded animate-pulse" />
                                                <div className="h-3 w-4/6 bg-neutral-800/50 rounded animate-pulse" />
                                            </div>

                                            <div className="flex items-center justify-center text-purple-400/50 text-xs font-medium gap-2 pt-2">
                                                <Loader2 size={12} className="animate-spin" />
                                                Creating Scene {i + 1}...
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    // ACTUAL CONTENTS
                                    state.scripts.map((script, index) => (
                                        <div
                                            key={index}
                                            className="bg-neutral-900 border border-neutral-700 rounded-xl p-4"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-purple-400 text-sm font-medium">
                                                    Scene {script.sceneNumber}
                                                </span>
                                                <div className="flex items-center gap-2 text-xs text-neutral-500">
                                                    <span className="px-2 py-0.5 bg-neutral-800 rounded">
                                                        {script.cameraAngle}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-neutral-800 rounded">
                                                        {script.mood}
                                                    </span>
                                                </div>
                                            </div>

                                            {editingScriptIndex === index ? (
                                                <textarea
                                                    value={script.description}
                                                    onChange={(e) => onUpdateScript(index, { description: e.target.value })}
                                                    onBlur={() => setEditingScriptIndex(null)}
                                                    autoFocus
                                                    className="w-full bg-neutral-800 border border-neutral-600 rounded-lg p-2 text-white text-sm resize-none focus:outline-none focus:border-purple-500"
                                                    rows={3}
                                                />
                                            ) : (
                                                <p
                                                    onClick={() => setEditingScriptIndex(index)}
                                                    className="text-neutral-300 text-sm cursor-pointer hover:bg-neutral-800 rounded-lg p-2 -m-2 transition-colors group"
                                                >
                                                    {script.description}
                                                    <Edit3 size={12} className="inline ml-2 opacity-0 group-hover:opacity-50" />
                                                </p>
                                            )}
                                        </div>
                                    )))}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: PREVIEW COMPOSITE */}
                    {state.step === 'preview' && (
                        <div className="flex flex-col h-full">
                            <h3 className="text-white font-medium mb-2">Preview Storyboard</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                Review the composite storyboard. This image will be used as a reference to generate individual scenes with consistent characters and environments.
                            </p>

                            <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-700 overflow-hidden flex items-center justify-center p-4 relative group">
                                {state.isGeneratingPreview ? (
                                    <div className="text-center">
                                        <Loader2 size={48} className="animate-spin text-purple-500 mx-auto mb-4" />
                                        <p className="text-white font-medium">Generating Preview...</p>
                                        <p className="text-neutral-400 text-sm mt-2">Creating a cohesive storyboard with Nano Banana Pro</p>
                                    </div>
                                ) : state.compositeImageUrl ? (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <img
                                            src={state.compositeImageUrl}
                                            alt="Storyboard Composite"
                                            className="max-h-full max-w-full object-contain rounded shadow-lg"
                                        />
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={onRegenerateComposite}
                                                className="bg-black/70 hover:bg-black/90 text-white px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm flex items-center gap-2 border border-white/10"
                                            >
                                                <Wand2 size={12} />
                                                Regenerate
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-neutral-500">
                                        <p>No preview available</p>
                                        <button
                                            onClick={onGenerateComposite}
                                            className="mt-4 text-purple-400 hover:text-purple-300 text-sm underline"
                                        >
                                            Generate Preview
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 5: GENERATE (Summary now, since model selection is removed) */}
                    {state.step === 'generate' && (
                        <div>
                            <h3 className="text-white font-medium mb-2">Ready to Generate</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                Determine the final output. The individual scenes will be extracted from your preview image.
                            </p>

                            <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4">
                                <h4 className="text-white text-sm font-medium mb-2">Summary</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="text-neutral-400">Characters:</div>
                                    <div className="text-white">
                                        {state.selectedCharacters.length > 0
                                            ? state.selectedCharacters.map(c => c.name).join(', ')
                                            : 'None selected'}
                                    </div>
                                    <div className="text-neutral-400">Scenes:</div>
                                    <div className="text-white">{state.scripts.length}</div>
                                    <div className="text-neutral-400">Model:</div>
                                    <div className="text-white">Nano Banana Pro</div>
                                    <div className="text-neutral-400">Preview:</div>
                                    <div className="text-white">{state.compositeImageUrl ? 'Generated' : 'Not available'}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
                    {/* Back Button */}
                    <button
                        onClick={() => {
                            if (state.step === 'story') onSetStep('characters');
                            else if (state.step === 'scripts') onSetStep('story');
                            else if (state.step === 'preview') onSetStep('scripts');
                            else if (state.step === 'generate') onSetStep('preview');
                        }}
                        disabled={state.step === 'characters'}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${state.step === 'characters'
                            ? 'text-neutral-600 cursor-not-allowed'
                            : 'text-neutral-300 hover:bg-neutral-800'
                            }`}
                    >
                        <ChevronLeft size={16} />
                        Back
                    </button>

                    {/* Next/Generate Button */}
                    {state.step === 'characters' && (
                        <button
                            onClick={() => onSetStep('story')}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            Next
                            <ChevronRight size={16} />
                        </button>
                    )}

                    {state.step === 'story' && (
                        <button
                            onClick={onGenerateScripts}
                            disabled={state.isGenerating || !state.story.trim()}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${state.isGenerating || !state.story.trim()
                                ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                                }`}
                        >
                            {state.isGenerating ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Generating Scripts...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} />
                                    Generate Scripts
                                </>
                            )}
                        </button>
                    )}

                    {state.step === 'scripts' && (
                        <button
                            onClick={() => {
                                if (state.compositeImageUrl) {
                                    onRegenerateComposite();
                                } else {
                                    onSetStep('preview');
                                }
                            }}
                            disabled={state.isGeneratingPreview}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${state.isGeneratingPreview
                                ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                                }`}
                        >
                            {state.isGeneratingPreview ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Generating...
                                </>
                            ) : state.compositeImageUrl ? (
                                <>
                                    <Sparkles size={16} />
                                    Regenerate Preview
                                </>
                            ) : (
                                <>
                                    Next <ChevronRight size={16} />
                                </>
                            )}
                        </button>
                    )}

                    {state.step === 'preview' && (
                        <button
                            onClick={() => onSetStep('generate')}
                            disabled={!state.compositeImageUrl || state.isGeneratingPreview}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${!state.compositeImageUrl || state.isGeneratingPreview
                                ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                                }`}
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    )}

                    {state.step === 'generate' && (
                        <button
                            onClick={onCreateNodes}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            <Film size={16} />
                            Create Storyboard
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
