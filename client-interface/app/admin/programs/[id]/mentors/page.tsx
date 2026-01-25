'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Users, Loader2, UserPlus, Search, X } from 'lucide-react';
import { levelMentorApi } from '@/lib/services/level-mentor-api';
import { programManagementApi } from '@/lib/services/program-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { toast } from 'sonner';

export default function LevelMentorsManagement() {
  const params = useParams();
  const programId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [program, setProgram] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableMentors, setAvailableMentors] = useState<any[]>([]);
  const [filteredMentors, setFilteredMentors] = useState<any[]>([]);
  const [selectedMentor, setSelectedMentor] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [loadingMentors, setLoadingMentors] = useState(false);

  useEffect(() => {
    if (programId) {
      fetchData();
    }
  }, [programId]);

  useEffect(() => {
    if (showAddModal) {
      fetchMentors();
    }
  }, [showAddModal]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = availableMentors.filter((mentor) => {
        const fullName = `${mentor.firstName} ${mentor.lastName}`.toLowerCase();
        const email = mentor.email.toLowerCase();
        const query = searchQuery.toLowerCase();
        return fullName.includes(query) || email.includes(query);
      });
      setFilteredMentors(filtered);
    } else {
      setFilteredMentors(availableMentors);
    }
  }, [searchQuery, availableMentors]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [assignmentsRes, programRes] = await Promise.all([
        levelMentorApi.getProgramMentorAssignments(programId),
        programManagementApi.programs.getById(programId)
      ]);
      
      setAssignments(assignmentsRes?.data?.assignments || assignmentsRes?.assignments || []);
      setProgram(programRes?.data?.program || programRes?.program || null);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load mentor assignments');
    } finally {
      setLoading(false);
    }
  };

  const fetchMentors = async () => {
    try {
      setLoadingMentors(true);
      const response = await mentorApi.getAll();
      const mentorsList = response?.data?.mentors || response?.mentors || [];
      setAvailableMentors(mentorsList);
      setFilteredMentors(mentorsList);
    } catch (error: any) {
      console.error('Failed to fetch mentors:', error);
      toast.error('Failed to load mentors');
    } finally {
      setLoadingMentors(false);
    }
  };

  const handleAddMentor = async () => {
    if (!selectedLevel || !selectedMentor) {
      toast.error('Please select a mentor');
      return;
    }

    try {
      setAdding(true);
      await levelMentorApi.assignMentorToLevel(programId, selectedLevel.id, selectedMentor.id);
      toast.success('Mentor assigned successfully');
      setShowAddModal(false);
      setSelectedMentor(null);
      setSearchQuery('');
      fetchData();
    } catch (error: any) {
      console.error('Failed to add mentor:', error);
      toast.error(error.response?.data?.message || 'Failed to assign mentor');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMentor = async (levelId: string, mentorId: string) => {
    if (!confirm('Are you sure you want to remove this mentor from the level?')) {
      return;
    }

    try {
      setRemoving(mentorId);
      await levelMentorApi.removeMentorFromLevel(programId, levelId, mentorId);
      toast.success('Mentor removed successfully');
      fetchData();
    } catch (error: any) {
      console.error('Failed to remove mentor:', error);
      toast.error(error.response?.data?.message || 'Failed to remove mentor');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/admin/programs/${programId}`}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Program
        </Link>
        <h1 className="text-slate-900 mb-2">Manage Level Mentors</h1>
        <p className="text-slate-600">
          Assign mentors to specific levels in {program?.name}
        </p>
      </div>

      {/* Levels List */}
      <div className="space-y-6">
        {assignments.map((assignment) => (
          <div key={assignment.level.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-slate-900 font-medium">{assignment.level.name}</h3>
                <p className="text-slate-600 text-sm">
                  {assignment.mentors.length} mentor{assignment.mentors.length !== 1 ? 's' : ''} assigned
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedLevel(assignment.level);
                  setShowAddModal(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Mentor
              </button>
            </div>

            {assignment.mentors.length > 0 ? (
              <div className="divide-y divide-slate-200">
                {assignment.mentors.map((mentor: any) => (
                  <div key={mentor.id} className="p-6 flex items-start gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                      <Users className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-slate-900 font-medium">
                        {mentor.firstName} {mentor.lastName}
                      </h4>
                      <p className="text-slate-600 text-sm">{mentor.email}</p>
                      {mentor.mentorProfile?.specialization && mentor.mentorProfile.specialization.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {mentor.mentorProfile.specialization.map((skill: string, idx: number) => (
                            <span key={idx} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveMentor(assignment.level.id, mentor.id)}
                      disabled={removing === mentor.id}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {removing === mentor.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-slate-400" />
                </div>
                <h4 className="text-slate-900 mb-2">No Mentors Assigned</h4>
                <p className="text-slate-600 text-sm mb-4">
                  Assign mentors to this level to enable mentor-mentee matching
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Mentor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-900 text-xl font-semibold">
                Add Mentor to {selectedLevel?.name}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedMentor(null);
                  setSearchQuery('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search mentors by name or email..."
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Mentor List */}
            {loadingMentors ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : filteredMentors.length > 0 ? (
              <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
                {filteredMentors.map((mentor) => (
                  <button
                    key={mentor.id}
                    onClick={() => setSelectedMentor(mentor)}
                    className={`w-full p-4 border-2 rounded-xl transition-all text-left ${
                      selectedMentor?.id === mentor.id
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">
                          {mentor.firstName} {mentor.lastName}
                        </div>
                        <div className="text-sm text-slate-600">{mentor.email}</div>
                        {mentor.mentorProfile?.title && (
                          <div className="text-xs text-slate-500 mt-1">
                            {mentor.mentorProfile.title}
                            {mentor.mentorProfile.organization && ` at ${mentor.mentorProfile.organization}`}
                          </div>
                        )}
                        {mentor.mentorProfile?.specialization && mentor.mentorProfile.specialization.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {mentor.mentorProfile.specialization.slice(0, 3).map((skill: string, idx: number) => (
                              <span key={idx} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                                {skill}
                              </span>
                            ))}
                            {mentor.mentorProfile.specialization.length > 3 && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                                +{mentor.mentorProfile.specialization.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">
                          {mentor.mentorProfile?.currentMenteeCount || 0}/{mentor.mentorProfile?.maxMentees || 5}
                        </div>
                        <div className="text-xs text-slate-400">mentees</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">No mentors found</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedMentor(null);
                  setSearchQuery('');
                }}
                className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMentor}
                disabled={adding || !selectedMentor}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {adding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Mentor'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
