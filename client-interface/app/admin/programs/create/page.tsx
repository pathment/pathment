'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  X, 
  ArrowRight, 
  Check, 
  Sparkles, 
  Loader2,
  Edit,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import programManagementApi from '@/lib/services/program-api';

interface ProgramData {
  name: string;
  description: string;
  type: string;
  status: string;
  totalDurationWeeks: number;
  estimatedHoursPerWeek: number;
  maxEnrollments: number | '';
  tags: string[];
  learningOutcomes: string[];
  prerequisites: string[];
  targetAudience: string;
}

interface LevelData {
  name: string;
  description: string;
  orderIndex: number;
  durationWeeks: number;
  learningOutcomes: string[];
  prerequisites: string[];
  isOptional: boolean;
}

export default function CreateProgramFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get program ID from URL if exists
  const programIdFromUrl = searchParams.get('programId');
  const stepFromUrl = searchParams.get('step');
  
  const [currentStep, setCurrentStep] = useState(stepFromUrl ? parseInt(stepFromUrl) : 1);
  const [loading, setLoading] = useState(false);
  const [createdProgramId, setCreatedProgramId] = useState<string | null>(programIdFromUrl);
  const [createdLevels, setCreatedLevels] = useState<any[]>([]);

  // Restore state on mount if URL has program ID
  useEffect(() => {
    if (programIdFromUrl && !createdProgramId) {
      setCreatedProgramId(programIdFromUrl);
      if (stepFromUrl) {
        setCurrentStep(parseInt(stepFromUrl));
      }
    }
  }, [programIdFromUrl, stepFromUrl]);

  // Fetch levels when on step 2 or 3 and we have a program ID
  useEffect(() => {
    const fetchLevels = async () => {
      if (createdProgramId && (currentStep === 2 || currentStep === 3) && createdLevels.length === 0) {
        try {
          setLoading(true);
          const response = await programManagementApi.levels.getByProgram(createdProgramId);
          // Response structure: { success, data: { levels: [...] } }
          const levels = response?.levels || response;
          setCreatedLevels(Array.isArray(levels) ? levels : []);
        } catch (error: any) {
          console.error('Failed to fetch levels:', error);
          toast({
            title: 'Warning',
            description: 'Could not load existing levels',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      }
    };

    fetchLevels();
  }, [createdProgramId, currentStep]);

  // Step 1: Program Basic Info
  const [programData, setProgramData] = useState<ProgramData>({
    name: '',
    description: '',
    type: '',
    status: 'draft',
    totalDurationWeeks: 12,
    estimatedHoursPerWeek: 10,
    maxEnrollments: '',
    tags: [],
    learningOutcomes: [],
    prerequisites: [],
    targetAudience: '',
  });

  // Step 2: Program Levels
  const [levels, setLevels] = useState<LevelData[]>([]);
  const [editingLevelIndex, setEditingLevelIndex] = useState<number | null>(null);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<LevelData>({
    name: '',
    description: '',
    orderIndex: 0,
    durationWeeks: 4,
    learningOutcomes: [],
    prerequisites: [],
    isOptional: false,
  });

  // Step 3: Roadmap Generation
  const [selectedLevelForRoadmap, setSelectedLevelForRoadmap] = useState<number | null>(null);
  const [roadmapInstructions, setRoadmapInstructions] = useState('');
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);

  // Input states for arrays
  const [tagInput, setTagInput] = useState('');
  const [outcomeInput, setOutcomeInput] = useState('');
  const [prerequisiteInput, setPrerequisiteInput] = useState('');
  const [levelOutcomeInput, setLevelOutcomeInput] = useState('');
  const [levelPrerequisiteInput, setLevelPrerequisiteInput] = useState('');

  // Step 1: Create Program
  const handleCreateProgram = async () => {
    try {
      setLoading(true);

      // Validation
      if (!programData.name || !programData.description || !programData.type) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive',
        });
        return;
      }

      const response = await programManagementApi.programs.create(programData);
      
      // API returns: { success: true, message: '...', data: { program: {...} } }
      const programId = response?.program?.id;
      
      if (!programId) {
        throw new Error('Program ID not returned from API');
      }
      
      setCreatedProgramId(programId);
      
      // Update URL with program ID and step
      router.push(`/admin/programs/create?programId=${programId}&step=2`);
      
      toast({
        title: 'Success!',
        description: 'Program created successfully',
      });

      setCurrentStep(2);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create program',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Add or Update Level
  const handleAddLevel = async () => {
    if (!currentLevel.name || !currentLevel.durationWeeks) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in level name and duration',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);

      if (editingLevelId) {
        // Update existing level in backend
        const response = await programManagementApi.levels.update(editingLevelId, currentLevel);
        const updatedLevel = response.data?.level || response.level || response;
        
        // Update in createdLevels state
        setCreatedLevels(createdLevels.map(level => 
          level.id === editingLevelId ? updatedLevel : level
        ));
        
        toast({
          title: 'Success!',
          description: 'Level updated successfully',
        });
      } else if (createdProgramId) {
        // Save new level immediately to backend
        const levelData = { ...currentLevel, orderIndex: createdLevels.length + levels.length };
        const response = await programManagementApi.levels.create(createdProgramId, levelData);
        const savedLevel = response.data?.level || response.level || response;
        
        setCreatedLevels([...createdLevels, savedLevel]);
        
        toast({
          title: 'Success!',
          description: 'Level added successfully',
        });
      } else {
        // No program yet - add to local state (for initial flow)
        if (editingLevelIndex !== null) {
          const updatedLevels = [...levels];
          updatedLevels[editingLevelIndex] = { ...currentLevel, orderIndex: editingLevelIndex };
          setLevels(updatedLevels);
        } else {
          setLevels([...levels, { ...currentLevel, orderIndex: levels.length }]);
        }
      }

      // Reset form
      setCurrentLevel({
        name: '',
        description: '',
        orderIndex: 0,
        durationWeeks: 4,
        learningOutcomes: [],
        prerequisites: [],
        isOptional: false,
      });
      setEditingLevelIndex(null);
      setEditingLevelId(null);
      setLevelOutcomeInput('');
      setLevelPrerequisiteInput('');
    } catch (error: any) {
      console.error('Level save error:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to save level',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLevel = async (index: number, levelId?: string) => {
    if (levelId) {
      // Delete from backend
      try {
        setLoading(true);
        await programManagementApi.levels.delete(levelId);
        setCreatedLevels(createdLevels.filter(level => level.id !== levelId));
        toast({
          title: 'Success!',
          description: 'Level deleted successfully',
        });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete level',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    } else {
      // Remove from local state
      setLevels(levels.filter((_, i) => i !== index));
    }
  };

  const handleEditLevel = (index: number, level: any, levelId?: string) => {
    setCurrentLevel({
      name: level.name,
      description: level.description || '',
      orderIndex: level.orderIndex || level.levelOrder || index,
      durationWeeks: level.durationWeeks,
      learningOutcomes: level.learningOutcomes || [],
      prerequisites: level.prerequisites || [],
      isOptional: level.isOptional || false,
    });
    setEditingLevelIndex(levelId ? null : index);
    setEditingLevelId(levelId || null);
    
    // Scroll to form
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setCurrentLevel({
      name: '',
      description: '',
      orderIndex: 0,
      durationWeeks: 4,
      learningOutcomes: [],
      prerequisites: [],
      isOptional: false,
    });
    setEditingLevelIndex(null);
    setEditingLevelId(null);
    setLevelOutcomeInput('');
    setLevelPrerequisiteInput('');
  };

  const handleSaveLevels = async () => {
    const totalLevels = createdLevels.length + levels.length;
    
    if (totalLevels === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one level',
        variant: 'destructive',
      });
      return;
    }

    // If there are unsaved local levels, save them first
    if (levels.length > 0 && createdProgramId) {
      try {
        setLoading(true);
        const savedLevels = [];

        for (const level of levels) {
          const response = await programManagementApi.levels.create(createdProgramId, level);
          const savedLevel = response.data?.level || response.level || response;
          savedLevels.push(savedLevel);
        }

        setCreatedLevels([...createdLevels, ...savedLevels]);
        setLevels([]);
      } catch (error: any) {
        console.error('Level save error:', error);
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to save levels',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }

    // Navigate to next step
    router.push(`/admin/programs/create?programId=${createdProgramId}&step=3`);
    setCurrentStep(3);
  };

  // Step 3: Generate Roadmap
  const handleGenerateRoadmap = async (levelIndex: number) => {
    try {
      setGeneratingRoadmap(true);
      setSelectedLevelForRoadmap(levelIndex);

      const level = createdLevels[levelIndex];
      
      if (!level || !level.id) {
        throw new Error('Level ID is missing. Please refresh and try again.');
      }
      
      const roadmap = await programManagementApi.roadmaps.generate(
        createdProgramId!,
        level.id,
        roadmapInstructions
      );

      toast({
        title: 'Success!',
        description: `AI Roadmap generated for "${level.name}"`,
      });

      setRoadmapInstructions('');
      setSelectedLevelForRoadmap(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to generate roadmap',
        variant: 'destructive',
      });
    } finally {
      setGeneratingRoadmap(false);
    }
  };

  const handleFinish = () => {
    toast({
      title: 'Program Created Successfully! 🎉',
      description: 'Your program is now ready',
    });
    router.push(`/admin/programs/${createdProgramId}`);
  };

  // Array helpers
  const addTag = () => {
    if (tagInput.trim() && !programData.tags.includes(tagInput.trim())) {
      setProgramData({ ...programData, tags: [...programData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    console.log('Removing tag:', tag);
    setProgramData({ ...programData, tags: programData.tags.filter(t => t !== tag) });
  };

  const addOutcome = () => {
    if (outcomeInput.trim() && !programData.learningOutcomes.includes(outcomeInput.trim())) {
      setProgramData({ 
        ...programData, 
        learningOutcomes: [...programData.learningOutcomes, outcomeInput.trim()] 
      });
      setOutcomeInput('');
    }
  };

  const removeOutcome = (outcome: string) => {
    setProgramData({ 
      ...programData, 
      learningOutcomes: programData.learningOutcomes.filter(o => o !== outcome) 
    });
  };

  const addPrerequisite = () => {
    if (prerequisiteInput.trim() && !programData.prerequisites.includes(prerequisiteInput.trim())) {
      setProgramData({ 
        ...programData, 
        prerequisites: [...programData.prerequisites, prerequisiteInput.trim()] 
      });
      setPrerequisiteInput('');
    }
  };

  const removePrerequisite = (prereq: string) => {
    setProgramData({ 
      ...programData, 
      prerequisites: programData.prerequisites.filter(p => p !== prereq) 
    });
  };

  const addLevelOutcome = () => {
    if (levelOutcomeInput.trim() && !currentLevel.learningOutcomes.includes(levelOutcomeInput.trim())) {
      setCurrentLevel({ 
        ...currentLevel, 
        learningOutcomes: [...currentLevel.learningOutcomes, levelOutcomeInput.trim()] 
      });
      setLevelOutcomeInput('');
    }
  };

  const removeLevelOutcome = (outcome: string) => {
    setCurrentLevel({ 
      ...currentLevel, 
      learningOutcomes: currentLevel.learningOutcomes.filter(o => o !== outcome) 
    });
  };

  const addLevelPrerequisite = () => {
    if (levelPrerequisiteInput.trim() && !currentLevel.prerequisites.includes(levelPrerequisiteInput.trim())) {
      setCurrentLevel({ 
        ...currentLevel, 
        prerequisites: [...currentLevel.prerequisites, levelPrerequisiteInput.trim()] 
      });
      setLevelPrerequisiteInput('');
    }
  };

  const removeLevelPrerequisite = (prereq: string) => {
    setCurrentLevel({ 
      ...currentLevel, 
      prerequisites: currentLevel.prerequisites.filter(p => p !== prereq) 
    });
  };

  const steps = [
    { number: 1, title: 'Program Info', description: 'Basic details' },
    { number: 2, title: 'Add Levels', description: 'Program structure' },
    { number: 3, title: 'Generate Roadmaps', description: 'AI-powered content' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/programs/list">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Create New Program</h1>
            <p className="text-muted-foreground mt-1">
              Complete program setup with levels and AI-generated roadmaps
            </p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all ${
                  currentStep > step.number
                    ? 'bg-primary text-primary-foreground border-primary'
                    : currentStep === step.number
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border'
                }`}
              >
                {currentStep > step.number ? <Check className="h-5 w-5" /> : step.number}
              </div>
              <div className="mt-2 text-center">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-1 w-20 mx-4 mt-[-32px] transition-all ${
                  currentStep > step.number ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {currentStep === 1 && (
        <ProgramBasicInfo
          programData={programData}
          setProgramData={setProgramData}
          tagInput={tagInput}
          setTagInput={setTagInput}
          addTag={addTag}
          removeTag={removeTag}
          outcomeInput={outcomeInput}
          setOutcomeInput={setOutcomeInput}
          addOutcome={addOutcome}
          removeOutcome={removeOutcome}
          prerequisiteInput={prerequisiteInput}
          setPrerequisiteInput={setPrerequisiteInput}
          addPrerequisite={addPrerequisite}
          removePrerequisite={removePrerequisite}
          onNext={handleCreateProgram}
          loading={loading}
        />
      )}

      {currentStep === 2 && (
        <ProgramLevels
          levels={levels}
          createdLevels={createdLevels}
          currentLevel={currentLevel}
          setCurrentLevel={setCurrentLevel}
          levelOutcomeInput={levelOutcomeInput}
          setLevelOutcomeInput={setLevelOutcomeInput}
          addLevelOutcome={addLevelOutcome}
          removeLevelOutcome={removeLevelOutcome}
          levelPrerequisiteInput={levelPrerequisiteInput}
          setLevelPrerequisiteInput={setLevelPrerequisiteInput}
          addLevelPrerequisite={addLevelPrerequisite}
          removeLevelPrerequisite={removeLevelPrerequisite}
          onAddLevel={handleAddLevel}
          onRemoveLevel={handleRemoveLevel}
          onEditLevel={handleEditLevel}
          onCancelEdit={handleCancelEdit}
          onBack={() => setCurrentStep(1)}
          onNext={handleSaveLevels}
          loading={loading}
          editingLevelIndex={editingLevelIndex}
          editingLevelId={editingLevelId}
        />
      )}

      {currentStep === 3 && (
        <RoadmapGeneration
          levels={createdLevels}
          selectedLevel={selectedLevelForRoadmap}
          roadmapInstructions={roadmapInstructions}
          setRoadmapInstructions={setRoadmapInstructions}
          onGenerate={handleGenerateRoadmap}
          onFinish={handleFinish}
          generatingRoadmap={generatingRoadmap}
        />
      )}
    </div>
  );
}

// Component for Step 1 - Program Basic Info
function ProgramBasicInfo({ programData, setProgramData, tagInput, setTagInput, addTag, removeTag, outcomeInput, setOutcomeInput, addOutcome, removeOutcome, prerequisiteInput, setPrerequisiteInput, addPrerequisite, removePrerequisite, onNext, loading }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Program Information</CardTitle>
        <CardDescription>Set up the basic details of your mentorship program</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Program Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Full Stack Web Development Bootcamp"
              value={programData.name}
              onChange={(e) => setProgramData({ ...programData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe the program objectives, outcomes, and key focus areas..."
              rows={4}
              value={programData.description}
              onChange={(e) => setProgramData({ ...programData, description: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Program Type *</Label>
            <Select value={programData.type} onValueChange={(value) => setProgramData({ ...programData, type: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internship">Internship</SelectItem>
                <SelectItem value="mentorship">Mentorship</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={programData.status} onValueChange={(value) => setProgramData({ ...programData, status: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Total Duration (weeks) *</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              max="104"
              value={programData.totalDurationWeeks}
              onChange={(e) => setProgramData({ ...programData, totalDurationWeeks: parseInt(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hoursPerWeek">Hours Per Week *</Label>
            <Input
              id="hoursPerWeek"
              type="number"
              min="1"
              max="40"
              value={programData.estimatedHoursPerWeek}
              onChange={(e) => setProgramData({ ...programData, estimatedHoursPerWeek: parseInt(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxEnrollments">Max Enrollments (optional)</Label>
            <Input
              id="maxEnrollments"
              type="number"
              min="1"
              placeholder="Leave empty for unlimited"
              value={programData.maxEnrollments}
              onChange={(e) => setProgramData({ ...programData, maxEnrollments: e.target.value ? parseInt(e.target.value) : '' })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetAudience">Target Audience</Label>
            <Input
              id="targetAudience"
              placeholder="e.g., Junior developers, Career switchers"
              value={programData.targetAudience}
              onChange={(e) => setProgramData({ ...programData, targetAudience: e.target.value })}
            />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add tag (e.g., JavaScript, React)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            />
            <Button type="button" variant="outline" onClick={addTag}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {programData.tags.map((tag: string) => (
              <Badge key={tag} variant="secondary" className="pr-1">
                <span className="mr-1">{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-auto inline-flex items-center justify-center rounded-sm hover:bg-destructive/20 h-4 w-4 p-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        {/* Learning Outcomes */}
        <div className="space-y-2">
          <Label>Learning Outcomes</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add learning outcome"
              value={outcomeInput}
              onChange={(e) => setOutcomeInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOutcome())}
            />
            <Button type="button" variant="outline" onClick={addOutcome}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1 mt-2">
            {programData.learningOutcomes.map((outcome: string, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm">{outcome}</span>
                <X className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => removeOutcome(outcome)} />
              </div>
            ))}
          </div>
        </div>

        {/* Prerequisites */}
        <div className="space-y-2">
          <Label>Prerequisites</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add prerequisite"
              value={prerequisiteInput}
              onChange={(e) => setPrerequisiteInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addPrerequisite())}
            />
            <Button type="button" variant="outline" onClick={addPrerequisite}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1 mt-2">
            {programData.prerequisites.map((prereq: string, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm">{prereq}</span>
                <X className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => removePrerequisite(prereq)} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onNext} disabled={loading} size="lg">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Next: Add Levels
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Component for Step 2 - Program Levels
function ProgramLevels({ levels, createdLevels, currentLevel, setCurrentLevel, levelOutcomeInput, setLevelOutcomeInput, addLevelOutcome, removeLevelOutcome, levelPrerequisiteInput, setLevelPrerequisiteInput, addLevelPrerequisite, removeLevelPrerequisite, onAddLevel, onRemoveLevel, onEditLevel, onCancelEdit, onBack, onNext, loading, editingLevelIndex, editingLevelId }: any) {
  const allLevels = [...createdLevels, ...levels];
  const totalLevels = allLevels.length;

  return (
    <div className="space-y-6">
      {/* Added Levels */}
      {totalLevels > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Program Levels ({totalLevels})</CardTitle>
            <CardDescription>Levels will be executed in this order</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Saved levels from backend */}
            {createdLevels.map((level: any, index: number) => {
              const isEditing = editingLevelId === level.id;
              return (
                <div key={level.id} className={`flex items-start justify-between p-4 border rounded-lg ${isEditing ? 'border-primary bg-primary/5' : ''}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Level {index + 1}</Badge>
                      <h4 className="font-semibold">{level.name}</h4>
                      {level.isOptional && <Badge variant="outline">Optional</Badge>}
                      <Badge variant="secondary" className="text-xs">Saved</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{level.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Duration: {level.durationWeeks} weeks</p>
                    {level.learningOutcomes && level.learningOutcomes.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Outcomes: {level.learningOutcomes.length} items
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditLevel(index, level, level.id)}
                      disabled={loading}
                    >
                      <Edit className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveLevel(index, level.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
            
            {/* Unsaved levels (local state) */}
            {levels.map((level: LevelData, index: number) => {
              const isEditing = editingLevelIndex === index;
              const actualIndex = createdLevels.length + index;
              return (
                <div key={`local-${index}`} className={`flex items-start justify-between p-4 border rounded-lg border-dashed ${isEditing ? 'border-primary bg-primary/5' : ''}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Level {actualIndex + 1}</Badge>
                      <h4 className="font-semibold">{level.name}</h4>
                      {level.isOptional && <Badge variant="outline">Optional</Badge>}
                      <Badge variant="secondary" className="text-xs">Not saved</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{level.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Duration: {level.durationWeeks} weeks</p>
                    {level.learningOutcomes.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Outcomes: {level.learningOutcomes.length} items
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditLevel(index, level)}
                    >
                      <Edit className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveLevel(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Add New Level Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{editingLevelId || editingLevelIndex !== null ? 'Edit Level' : 'Add New Level'}</CardTitle>
              <CardDescription>Define the structure and progression of your program</CardDescription>
            </div>
            {(editingLevelId || editingLevelIndex !== null) && (
              <Button variant="outline" size="sm" onClick={onCancelEdit}>
                Cancel Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="levelName">Level Name *</Label>
              <Input
                id="levelName"
                placeholder="e.g., Beginner, Intermediate, Advanced"
                value={currentLevel.name}
                onChange={(e) => setCurrentLevel({ ...currentLevel, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="levelDuration">Duration (weeks) *</Label>
              <Input
                id="levelDuration"
                type="number"
                min="1"
                max="52"
                value={currentLevel.durationWeeks}
                onChange={(e) => setCurrentLevel({ ...currentLevel, durationWeeks: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="levelDescription">Description</Label>
              <Textarea
                id="levelDescription"
                placeholder="Describe what this level covers..."
                rows={3}
                value={currentLevel.description}
                onChange={(e) => setCurrentLevel({ ...currentLevel, description: e.target.value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isOptional"
                  checked={currentLevel.isOptional}
                  onChange={(e) => setCurrentLevel({ ...currentLevel, isOptional: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="isOptional">This level is optional</Label>
              </div>
            </div>
          </div>

          {/* Level Learning Outcomes */}
          <div className="space-y-2">
            <Label>Learning Outcomes for this Level</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add learning outcome"
                value={levelOutcomeInput}
                onChange={(e) => setLevelOutcomeInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLevelOutcome())}
              />
              <Button type="button" variant="outline" onClick={addLevelOutcome}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1 mt-2">
              {currentLevel.learningOutcomes.map((outcome: string, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span className="text-sm">{outcome}</span>
                  <X className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => removeLevelOutcome(outcome)} />
                </div>
              ))}
            </div>
          </div>

          {/* Level Prerequisites */}
          <div className="space-y-2">
            <Label>Prerequisites for this Level</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add prerequisite"
                value={levelPrerequisiteInput}
                onChange={(e) => setLevelPrerequisiteInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLevelPrerequisite())}
              />
              <Button type="button" variant="outline" onClick={addLevelPrerequisite}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1 mt-2">
              {currentLevel.prerequisites.map((prereq: string, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span className="text-sm">{prereq}</span>
                  <X className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => removeLevelPrerequisite(prereq)} />
                </div>
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onAddLevel}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {editingLevelId || editingLevelIndex !== null ? 'Updating...' : 'Saving...'}
              </>
            ) : (
              <>
                {editingLevelId || editingLevelIndex !== null ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Update Level
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Level to Program
                  </>
                )}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} disabled={loading || totalLevels === 0} size="lg">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Next: Generate Roadmaps
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Component for Step 3 - Roadmap Generation
function RoadmapGeneration({ levels, selectedLevel, roadmapInstructions, setRoadmapInstructions, onGenerate, onFinish, generatingRoadmap }: any) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Roadmap Generation
          </CardTitle>
          <CardDescription>
            Generate detailed week-by-week roadmaps for each level using AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            {levels.map((level: any, index: number) => (
              <div key={level.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge>Level {index + 1}</Badge>
                      <h4 className="font-semibold">{level.name}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{level.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Duration: {level.durationWeeks} weeks
                    </p>
                    {level.learningOutcomes && level.learningOutcomes.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium">Learning Outcomes:</p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                          {level.learningOutcomes.slice(0, 3).map((outcome: string, i: number) => (
                            <li key={i}>{outcome}</li>
                          ))}
                          {level.learningOutcomes.length > 3 && (
                            <li>+{level.learningOutcomes.length - 3} more...</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="ml-4">
                    <Button
                      onClick={() => onGenerate(index)}
                      disabled={generatingRoadmap && selectedLevel === index}
                      variant="default"
                    >
                      {generatingRoadmap && selectedLevel === index ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Generate Roadmap
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {selectedLevel === index && generatingRoadmap && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground animate-pulse">
                      AI is creating a detailed {level.durationWeeks}-week roadmap with tasks, objectives, and milestones...
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Additional Instructions (Optional)</Label>
            <Textarea
              id="instructions"
              placeholder="Add any specific requirements or focus areas for the AI to consider..."
              rows={3}
              value={roadmapInstructions}
              onChange={(e) => setRoadmapInstructions(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              These instructions will be used for the next roadmap generation
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">💡 Tip: Roadmap Generation</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• You can generate roadmaps now or skip and do it later</li>
              <li>• AI creates week-by-week plans with tasks and milestones</li>
              <li>• You can edit roadmaps after generation</li>
              <li>• Each level gets its own customized roadmap</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Finish Button */}
      <div className="flex justify-end pt-4">
        <Button onClick={onFinish} size="lg" variant="default">
          <Check className="mr-2 h-4 w-4" />
          Finish & View Program
        </Button>
      </div>
    </div>
  );
}
