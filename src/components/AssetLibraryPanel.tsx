import React, { useState, useEffect } from 'react';
import { X, Search, Filter } from 'lucide-react';

interface LibraryAsset {
    id: string;
    name: string;
    category: string;
    url: string;
    type: 'image' | 'video';
}

interface AssetLibraryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectAsset: (url: string, type: 'image' | 'video') => void;
    panelY?: number;
}

const CATEGORIES = [
    'All',
    'Character',
    'Scene',
    'Item',
    'Style',
    'Sound Effect',
    'Others'
];

export const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({
    isOpen,
    onClose,
    onSelectAsset,
    panelY = 100
}) => {
    const [activeTab, setActiveTab] = useState<'public' | 'my'>('my');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [assets, setAssets] = useState<LibraryAsset[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && activeTab === 'my') {
            fetchLibrary();
        }
    }, [isOpen, activeTab]);

    const fetchLibrary = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/library'); // Adjust port if needed, relative path preferred in helper
            if (res.ok) {
                setAssets(await res.json());
            }
        } catch (error) {
            console.error("Failed to load library:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredAssets = assets.filter(asset =>
        selectedCategory === 'All' || asset.category === selectedCategory
    );

    if (!isOpen) return null;

    return (
        <div
            className="fixed left-20 z-40 w-96 bg-[#0a0a0a]/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden animate-in slide-in-from-left-4 duration-200"
            style={{ top: Math.min(window.innerHeight - 610, Math.max(20, panelY)) }}
        >
            {/* Header Tabs */}
            <div className="flex border-b border-neutral-800">
                <button
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'public' ? 'text-white border-b-2 border-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                    onClick={() => setActiveTab('public')}
                >
                    Public Assets
                </button>
                <button
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'my' ? 'text-white border-b-2 border-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                    onClick={() => setActiveTab('my')}
                >
                    My Assets
                </button>
            </div>

            <div className="p-4 flex flex-col gap-4 h-full overflow-hidden">

                {/* Filters */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${selectedCategory === cat
                                ? 'bg-neutral-100 text-black border-white'
                                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 gap-3">
                    {loading ? (
                        <div className="col-span-2 text-center py-10 text-neutral-500">Loading...</div>
                    ) : filteredAssets.length === 0 ? (
                        <div className="col-span-2 text-center py-10 text-neutral-500 text-sm">
                            No assets found in this category.
                        </div>
                    ) : (
                        filteredAssets.map(asset => (
                            <div
                                key={asset.id}
                                className="group relative aspect-square bg-neutral-900 rounded-lg overflow-hidden border border-neutral-800 hover:border-neutral-600 cursor-pointer"
                                onClick={() => onSelectAsset(asset.url, asset.type)}
                            >
                                <img
                                    src={asset.url}
                                    alt={asset.name}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                    <span className="text-white text-xs font-medium truncate">{asset.name}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
};
