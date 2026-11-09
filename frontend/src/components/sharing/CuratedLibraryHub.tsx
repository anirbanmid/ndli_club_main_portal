import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  ExternalLink, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FolderPlus, 
  Globe, 
  User, 
  Building2,
  BookmarkCheck
} from 'lucide-react';
import { 
  CuratedLibrary, 
  CuratedResourceLink, 
  fetchLibraries, 
  createLibrary, 
  isValidNDLIUrl,
  addResourceLink, 
  deleteResourceLink,
  trackResourceLinkClick 
} from '../../lib/campusApi';

interface CuratedLibraryHubProps {
  clubId: string;
  isAuthority: boolean;
  isStudent: boolean;
}

export const CuratedLibraryHub: React.FC<CuratedLibraryHubProps> = ({
  clubId,
  isAuthority,
  isStudent,
}) => {
  const [activeTier, setActiveTier] = useState<'club' | 'personal' | 'community'>('club');
  const [libraries, setLibraries] = useState<CuratedLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Library Modal
  const [isNewLibModalOpen, setIsNewLibModalOpen] = useState(false);
  const [newLibTitle, setNewLibTitle] = useState('');
  const [newLibTopic, setNewLibTopic] = useState('');
  const [createLibBusy, setCreateLibBusy] = useState(false);

  // Add Resource Modal
  const [activeLibForResource, setActiveLibForResource] = useState<CuratedLibrary | null>(null);
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceNdliUrl, setResourceNdliUrl] = useState('');
  const [resourceDesc, setResourceDesc] = useState('');
  const [addResourceBusy, setAddResourceBusy] = useState(false);

  const loadLibraries = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchLibraries(clubId, activeTier);
      setLibraries(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch curated libraries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibraries();
  }, [clubId, activeTier]);

  const handleCreateLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLibTitle.trim() || !newLibTopic.trim()) {
      setErrorMsg('Title and topic category are required.');
      return;
    }

    setCreateLibBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await createLibrary({
        title: newLibTitle.trim(),
        topic_category: newLibTopic.trim(),
        library_type: activeTier,
        club_code: clubId,
      });
      setLibraries(prev => [created, ...prev]);
      setSuccessMsg(`Library "${created.title}" established in ${activeTier.toUpperCase()} tier.`);
      setNewLibTitle('');
      setNewLibTopic('');
      setIsNewLibModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create curated library.');
    } finally {
      setCreateLibBusy(false);
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLibForResource) return;

    // Strict NDLI URL check
    if (!isValidNDLIUrl(resourceNdliUrl.trim())) {
      setErrorMsg('NDLI Law Violation: Resource URL must belong to official NDLI portals (ndli.iitkgp.ac.in, ndl.iitkgp.ac.in, or www.ndl.gov.in).');
      return;
    }

    setAddResourceBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const newLink = await addResourceLink(activeLibForResource.id, {
        title: resourceTitle.trim(),
        ndli_url: resourceNdliUrl.trim(),
        description: resourceDesc.trim() || undefined,
      });

      setLibraries(prev =>
        prev.map(lib =>
          lib.id === activeLibForResource.id
            ? { ...lib, resources: [...lib.resources, newLink] }
            : lib
        )
      );
      setSuccessMsg(`Resource "${newLink.title}" added to library.`);
      setResourceTitle('');
      setResourceNdliUrl('');
      setResourceDesc('');
      setActiveLibForResource(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add curated resource link.');
    } finally {
      setAddResourceBusy(false);
    }
  };

  const handleDeleteResource = async (libraryId: number, resourceId: number) => {
    if (!confirm('Are you sure you want to remove this resource link?')) return;
    try {
      await deleteResourceLink(resourceId);
      setLibraries(prev =>
        prev.map(lib =>
          lib.id === libraryId
            ? { ...lib, resources: lib.resources.filter(r => r.id !== resourceId) }
            : lib
        )
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete resource link.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-br from-[#103125] via-[#1A503E] to-[#0A5C3E] p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-emerald-800/40 border border-emerald-700/50 px-3 py-1 rounded-full text-xs font-bold text-emerald-300">
              <BookmarkCheck className="h-3.5 w-3.5" />
              <span>3-Tier Academic Curation</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Curated NDLI Digital Libraries
            </h2>
            <p className="text-xs text-emerald-100/90 max-w-xl">
              Strict repository enforcement: All curated resources must belong directly to official NDLI portals (<code className="text-amber-300 font-mono">ndli.iitkgp.ac.in</code>, <code className="text-amber-300 font-mono">ndl.iitkgp.ac.in</code>, <code className="text-amber-300 font-mono">www.ndl.gov.in</code>). External URLs are strictly rejected.
            </p>
          </div>

          <button
            onClick={() => setIsNewLibModalOpen(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[#103125] font-extrabold text-xs rounded-xl shadow-lg shadow-amber-950/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
          >
            <FolderPlus className="h-4 w-4" />
            <span>New {activeTier.toUpperCase()} Library</span>
          </button>
        </div>

        {/* 3-Tier Tabs Switcher */}
        <div className="mt-6 pt-4 border-t border-emerald-800/60 flex flex-wrap gap-2.5 text-xs font-bold">
          <button
            onClick={() => setActiveTier('club')}
            className={`px-4 py-2 rounded-xl transition-all duration-200 flex items-center space-x-2 cursor-pointer ${
              activeTier === 'club'
                ? 'bg-white text-[#103125] shadow-md shadow-black/20 scale-[1.03]'
                : 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800/80 hover:text-white hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Tier 1: Club Library (Official)</span>
          </button>

          <button
            onClick={() => setActiveTier('personal')}
            className={`px-4 py-2 rounded-xl transition-all duration-200 flex items-center space-x-2 cursor-pointer ${
              activeTier === 'personal'
                ? 'bg-white text-[#103125] shadow-md shadow-black/20 scale-[1.03]'
                : 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800/80 hover:text-white hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            <User className="h-4 w-4" />
            <span>Tier 2: Personal Study Library</span>
          </button>

          <button
            onClick={() => setActiveTier('community')}
            className={`px-4 py-2 rounded-xl transition-all duration-200 flex items-center space-x-2 cursor-pointer ${
              activeTier === 'community'
                ? 'bg-white text-[#103125] shadow-md shadow-black/20 scale-[1.03]'
                : 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800/80 hover:text-white hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            <Globe className="h-4 w-4" />
            <span>Tier 3: Inter-Club Community Hub</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-semibold flex items-start space-x-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-start space-x-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Libraries Grid */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center space-y-2">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span className="text-xs font-medium">Loading curated libraries...</span>
        </div>
      ) : libraries.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-gray-900">
            No {activeTier.toUpperCase()} Libraries Found
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Start curating topic-wise digital collections from official NDLI portals for your academic community.
          </p>
          <button
            onClick={() => setIsNewLibModalOpen(true)}
            className="mt-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all inline-flex items-center space-x-1.5"
          >
            <FolderPlus className="h-4 w-4" />
            <span>Create First Collection</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {libraries.map((lib) => (
            <div
              key={lib.id}
              className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                      {lib.topic_category}
                    </span>
                    <h4 className="text-base font-bold text-gray-900 mt-1 leading-tight">{lib.title}</h4>
                  </div>
                  <span className="text-xs font-bold text-gray-400 shrink-0">
                    {lib.resources.length} Links
                  </span>
                </div>

                {/* Resource Links List */}
                <div className="space-y-2 border-t border-gray-100 pt-3 max-h-52 overflow-y-auto pr-1">
                  {lib.resources.length === 0 ? (
                    <div className="text-[11px] text-gray-400 italic py-2 text-center">
                      No NDLI links added yet.
                    </div>
                  ) : (
                    lib.resources.map((link) => (
                      <div
                        key={link.id}
                        className="p-2.5 bg-gray-50 rounded-xl flex items-start justify-between gap-2 text-xs hover:bg-emerald-50/50 transition-colors group"
                      >
                        <div className="space-y-0.5 overflow-hidden">
                          <a
                            href={link.ndli_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => {
                              trackResourceLinkClick(link.id);
                            }}
                            className="font-bold text-gray-900 group-hover:text-emerald-950 flex items-center space-x-1 truncate"
                          >
                            <span className="truncate">{link.title}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 text-emerald-600" />
                          </a>
                          {link.description && (
                            <p className="text-[11px] text-gray-500 truncate">{link.description}</p>
                          )}
                          <div className="text-[9px] font-mono text-gray-400 truncate">
                            {link.ndli_url}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteResource(lib.id, link.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-rose-500 hover:bg-rose-50 rounded transition-opacity"
                          title="Remove resource"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Card Footer: Add Link CTA */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveLibForResource(lib)}
                  className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#0D7751] hover:text-[#0a5c3e] border border-emerald-200/80 rounded-xl text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add NDLI Link</span>
                </button>

                <div className="text-[10px] text-gray-400 font-medium">
                  {lib.is_published_to_community ? 'Community Published' : 'Private'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Library Modal */}
      {isNewLibModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-emerald-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white">
              <h3 className="text-lg font-bold">Create {activeTier.toUpperCase()} Collection</h3>
              <p className="text-xs text-emerald-200 mt-0.5">Organize resources into a topic directory</p>
            </div>

            <form onSubmit={handleCreateLibrary} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Collection Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newLibTitle}
                  onChange={(e) => setNewLibTitle(e.target.value)}
                  placeholder="e.g. Advanced AI & Quantum Computing"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Topic / Academic Discipline <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newLibTopic}
                  onChange={(e) => setNewLibTopic(e.target.value)}
                  placeholder="e.g. Computer Science & Engineering"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="flex space-x-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewLibModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLibBusy}
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center justify-center space-x-2"
                >
                  {createLibBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Create Collection</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Resource Link Modal (With Strict NDLI URL Law) */}
      {activeLibForResource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-emerald-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white">
              <h3 className="text-lg font-bold">Add Curated NDLI Resource</h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                Collection: {activeLibForResource.title}
              </p>
            </div>

            <form onSubmit={handleAddResource} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Resource Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  placeholder="e.g. Introduction to Deep Learning Lecture Notes"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  NDLI Resource URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  value={resourceNdliUrl}
                  onChange={(e) => setResourceNdliUrl(e.target.value)}
                  placeholder="https://ndl.gov.in/... or https://ndli.iitkgp.ac.in/..."
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-600 outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Must belong to official NDLI portals: <strong className="text-emerald-800">ndli.iitkgp.ac.in</strong>, <strong className="text-emerald-800">ndl.iitkgp.ac.in</strong>, or <strong className="text-emerald-800">www.ndl.gov.in</strong>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={resourceDesc}
                  onChange={(e) => setResourceDesc(e.target.value)}
                  rows={2}
                  placeholder="Brief note on topic relevance..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none resize-none"
                />
              </div>

              <div className="flex space-x-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setActiveLibForResource(null)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addResourceBusy}
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center justify-center space-x-2"
                >
                  {addResourceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Add to Library</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
