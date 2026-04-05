'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { ArrowRight, Loader2, Star, CheckCircle2, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Skill {
  id: string;
  name: string;
  category: string;
  description?: string;
}

interface UserSkill {
  skillId: string;
  proficiencyLevel: number;
  yearsOfExperience: number;
}

export default function SkillsOnboardingPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<UserSkill[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setInitialLoading(true);
    setError('');
    try {
      await Promise.all([fetchSkills(), fetchCategories()]);
    } catch (err) {
      setError('Failed to load skills data. Please refresh the page or try again later.');
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchSkills = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/skills`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch skills (${response.status})`);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        setSkills(data.data);
      } else {
        throw new Error('Invalid response format from skills API');
      }
    } catch (error: any) {
      console.error('Error fetching skills:', error);
      toast.error('Failed to load skills');
      throw error;
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/skills/categories`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch categories, using defaults');
        setCategories(['all']);
        return;
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        setCategories(['all', ...data.data]);
      } else {
        setCategories(['all']);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      setCategories(['all']);
    }
  };

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleSkill = (skillId: string) => {
    const exists = selectedSkills.find((s) => s.skillId === skillId);
    if (exists) {
      setSelectedSkills(selectedSkills.filter((s) => s.skillId !== skillId));
    } else {
      setSelectedSkills([
        ...selectedSkills,
        { skillId, proficiencyLevel: 3, yearsOfExperience: 0 }
      ]);
    }
  };

  const updateSkillLevel = (skillId: string, field: 'proficiencyLevel' | 'yearsOfExperience', value: number) => {
    setSelectedSkills(
      selectedSkills.map((s) =>
        s.skillId === skillId ? { ...s, [field]: value } : s
      )
    );
  };

  const handleSubmit = async () => {
    if (selectedSkills.length === 0) {
      toast.error('Please select at least one skill');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please log in again');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile/add-skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ skills: selectedSkills })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to add skills');
      }

      toast.success('Skills added successfully! Welcome to Pathment!');
      
      // Update user context
      if (updateUser) {
        updateUser({ ...user, onboardingStep: 2, profileCompleted: true });
      }

      // Redirect to dashboard based on role
      setTimeout(() => {
        router.push(`/${user?.role}/dashboard`);
      }, 1500);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add skills');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile/skip-skills`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        toast.success('Welcome to Pathment!');
        if (updateUser) {
          updateUser({ ...user, onboardingStep: 2, profileCompleted: true });
        }
        router.push(`/${user?.role}/dashboard`);
      }
    } catch (error) {
      toast.error('Failed to skip');
    }
  };

  const getSkillName = (skillId: string) => {
    return skills.find((s) => s.id === skillId)?.name || '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
            <Star className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-indigo-900 mb-2">Add Your Skills</h1>
          <p className="text-slate-600">Help us understand your expertise and match you better</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-8 h-2 bg-indigo-600 rounded-full"></div>
            <div className="w-8 h-2 bg-indigo-600 rounded-full"></div>
            <div className="w-8 h-2 bg-slate-200 rounded-full"></div>
          </div>
        </div>

        {/* Initial Loading State */}
        {initialLoading && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-12 text-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Loading skills...</p>
          </div>
        )}

        {/* Error State */}
        {!initialLoading && error && (
          <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-xl font-semibold text-red-900 mb-2">Unable to Load Skills</h3>
              <p className="text-slate-600">{error}</p>
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={loadData}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
              >
                <span>Try Again</span>
              </button>
              <button
                onClick={handleSkip}
                className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Skip for Now
              </button>
            </div>
          </div>
        )}

        {/* Empty Skills State */}
        {!initialLoading && !error && skills.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-amber-200 p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
                <span className="text-3xl">📚</span>
              </div>
              <h3 className="text-xl font-semibold text-amber-900 mb-2">No Skills Available</h3>
              <p className="text-slate-600 mb-1">The skills database is empty.</p>
              <p className="text-sm text-slate-500">Please contact your administrator to seed the skills database.</p>
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleSkip}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
              >
                Continue to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Main Content - Only show when data is loaded and no errors */}
        {!initialLoading && !error && skills.length > 0 && (
          <>
        {/* Selected Skills Summary */}
        {selectedSkills.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 mb-6">
            <h3 className="font-semibold text-slate-900 mb-4">Selected Skills ({selectedSkills.length})</h3>
            <div className="space-y-3">
              {selectedSkills.map((userSkill) => (
                <div key={userSkill.skillId} className="flex items-center gap-4 p-3 bg-indigo-50 rounded-xl">
                  <span className="flex-1 font-medium text-indigo-900">{getSkillName(userSkill.skillId)}</span>
                  
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Level:</label>
                    <select
                      value={userSkill.proficiencyLevel}
                      onChange={(e) => updateSkillLevel(userSkill.skillId, 'proficiencyLevel', parseInt(e.target.value))}
                      className="px-3 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={1}>Beginner</option>
                      <option value={2}>Elementary</option>
                      <option value={3}>Intermediate</option>
                      <option value={4}>Advanced</option>
                      <option value={5}>Expert</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Years:</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={userSkill.yearsOfExperience}
                      onChange={(e) => updateSkillLevel(userSkill.skillId, 'yearsOfExperience', parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <button
                    onClick={() => toggleSkill(userSkill.skillId)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills Selection */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          {/* Search & Filter */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Search skills..."
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>

          {/* Skills Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {filteredSkills.map((skill) => {
              const isSelected = selectedSkills.some((s) => s.skillId === skill.id);
              return (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{skill.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{skill.category}</div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                  </div>
                </button>
              );
            })}
          </div>

          {filteredSkills.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No skills found. Try a different search term.
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mt-8">
          <button
            onClick={handleSkip}
            className="flex-1 bg-white border-2 border-slate-200 text-slate-700 py-4 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Skip for Now
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || selectedSkills.length === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-4 rounded-xl transition-colors flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Completing...
              </>
            ) : (
              <>
                Complete Setup
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
