"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useProgramCreate } from "@/lib/hooks/admin";

export default function CreateProgramFlow() {
  const {
    currentStep,
    loading,
    createdProgramId,
    createdLevels,
    programData,
    setProgramData,
    tagInput,
    setTagInput,
    addTag,
    removeTag,
    outcomeInput,
    setOutcomeInput,
    addOutcome,
    removeOutcome,
    prerequisiteInput,
    setPrerequisiteInput,
    addPrerequisite,
    removePrerequisite,
    handleCreateProgram,
    levels,
    currentLevel,
    setCurrentLevel,
    editingLevelIndex,
    editingLevelId,
    levelOutcomeInput,
    setLevelOutcomeInput,
    addLevelOutcome,
    removeLevelOutcome,
    levelPrerequisiteInput,
    setLevelPrerequisiteInput,
    addLevelPrerequisite,
    removeLevelPrerequisite,
    handleAddLevel,
    handleRemoveLevel,
    handleEditLevel,
    handleCancelEdit,
    handleSaveLevels,
    selectedLevelForRoadmap,
    roadmapInstructions,
    setRoadmapInstructions,
    generatingRoadmap,
    handleGenerateRoadmap,
    handleFinish,
    goBack,
  } = useProgramCreate();

  const steps = [
    { number: 1, title: "Program Info", description: "Basic details" },
    { number: 2, title: "Add Levels", description: "Program structure" },
    {
      number: 3,
      title: "Generate Roadmaps",
      description: "AI-powered content",
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/admin/programs/list"
            className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Create New Program
            </h1>
            <p className="text-muted-foreground mt-1">
              Complete program setup with levels and AI-generated roadmaps
            </p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto flex min-w-[640px] items-center justify-center gap-2 sm:min-w-0">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex w-36 flex-col items-center text-center sm:w-auto">
                <div
                  className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all ${
                    currentStep > step.number
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : currentStep === step.number
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-400 border-slate-200"
                  }`}
                >
                  {currentStep > step.number ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    step.number
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-1 w-10 mx-2 -mt-8 transition-all sm:w-20 sm:mx-4 ${
                    currentStep > step.number ? "bg-indigo-600" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
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
          onBack={goBack}
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
function ProgramBasicInfo({
  programData,
  setProgramData,
  tagInput,
  setTagInput,
  addTag,
  removeTag,
  outcomeInput,
  setOutcomeInput,
  addOutcome,
  removeOutcome,
  prerequisiteInput,
  setPrerequisiteInput,
  addPrerequisite,
  removePrerequisite,
  onNext,
  loading,
}: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Program Information</CardTitle>
        <CardDescription>
          Set up the basic details of your mentorship program
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Program Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Full Stack Web Development Bootcamp"
              value={programData.name}
              onChange={(e) =>
                setProgramData({ ...programData, name: e.target.value })
              }
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
              onChange={(e) =>
                setProgramData({ ...programData, description: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Program Type *</Label>
            <Select
              value={programData.type}
              onValueChange={(value) =>
                setProgramData({ ...programData, type: value })
              }
            >
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
            <Select
              value={programData.status}
              onValueChange={(value) =>
                setProgramData({ ...programData, status: value })
              }
            >
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
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v))
                  setProgramData({ ...programData, totalDurationWeeks: v });
              }}
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
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v))
                  setProgramData({ ...programData, estimatedHoursPerWeek: v });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              min={new Date().toISOString().split("T")[0]}
              type="date"
              value={programData.startDate}
              onChange={(e) =>
                setProgramData({ ...programData, startDate: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              min={
                programData.startDate || new Date().toISOString().split("T")[0]
              }
              value={programData.endDate}
              onChange={(e) =>
                setProgramData({ ...programData, endDate: e.target.value })
              }
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
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setProgramData({
                  ...programData,
                  maxEnrollments:
                    e.target.value === ""
                      ? ""
                      : isNaN(v) || v < 1
                      ? programData.maxEnrollments
                      : v,
                });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetAudience">Target Audience</Label>
            <Input
              id="targetAudience"
              placeholder="e.g., Junior developers, Career switchers"
              value={programData.targetAudience}
              onChange={(e) =>
                setProgramData({
                  ...programData,
                  targetAudience: e.target.value,
                })
              }
            />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Add tag (e.g., JavaScript, React)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) =>
                e.key === "Enter" && (e.preventDefault(), addTag())
              }
            />
            <button
              type="button"
              onClick={addTag}
              className="inline-flex items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 p-2 rounded-lg transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
            </button>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Add learning outcome"
              value={outcomeInput}
              onChange={(e) => setOutcomeInput(e.target.value)}
              onKeyPress={(e) =>
                e.key === "Enter" && (e.preventDefault(), addOutcome())
              }
            />
            <button
              type="button"
              onClick={addOutcome}
              className="inline-flex items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 p-2 rounded-lg transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1 mt-2">
            {programData.learningOutcomes.map(
              (outcome: string, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-muted rounded"
                >
                  <span className="text-sm">{outcome}</span>
                  <X
                    className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={() => removeOutcome(outcome)}
                  />
                </div>
              )
            )}
          </div>
        </div>

        {/* Prerequisites */}
        <div className="space-y-2">
          <Label>Prerequisites</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Add prerequisite"
              value={prerequisiteInput}
              onChange={(e) => setPrerequisiteInput(e.target.value)}
              onKeyPress={(e) =>
                e.key === "Enter" && (e.preventDefault(), addPrerequisite())
              }
            />
            <button
              type="button"
              onClick={addPrerequisite}
              className="inline-flex items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 p-2 rounded-lg transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1 mt-2">
            {programData.prerequisites.map((prereq: string, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-muted rounded"
              >
                <span className="text-sm">{prereq}</span>
                <X
                  className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground"
                  onClick={() => removePrerequisite(prereq)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            onClick={onNext}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Next: Add Levels
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// Component for Step 2 - Program Levels
function ProgramLevels({
  levels,
  createdLevels,
  currentLevel,
  setCurrentLevel,
  levelOutcomeInput,
  setLevelOutcomeInput,
  addLevelOutcome,
  removeLevelOutcome,
  levelPrerequisiteInput,
  setLevelPrerequisiteInput,
  addLevelPrerequisite,
  removeLevelPrerequisite,
  onAddLevel,
  onRemoveLevel,
  onEditLevel,
  onCancelEdit,
  onBack,
  onNext,
  loading,
  editingLevelIndex,
  editingLevelId,
}: any) {
  const allLevels = [...createdLevels, ...levels];
  const totalLevels = allLevels.length;

  return (
    <div className="space-y-6">
      {/* Added Levels */}
      {totalLevels > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Program Levels ({totalLevels})</CardTitle>
            <CardDescription>
              Levels will be executed in this order
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Saved levels from backend */}
            {createdLevels.map((level: any, index: number) => {
              const isEditing = editingLevelId === level.id;
              return (
                <div
                  key={level.id}
                  className={`flex flex-col gap-3 p-4 border rounded-lg sm:flex-row sm:items-start sm:justify-between ${
                    isEditing ? "border-indigo-500 bg-indigo-50" : ""
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Level {index + 1}</Badge>
                      <h4 className="font-semibold">{level.name}</h4>
                      {level.isOptional && (
                        <Badge variant="outline">Optional</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        Saved
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {level.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Duration: {level.durationWeeks} weeks
                    </p>
                    {level.learningOutcomes &&
                      level.learningOutcomes.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Outcomes: {level.learningOutcomes.length} items
                        </p>
                      )}
                  </div>
                  <div className="flex gap-2 sm:ml-4">
                    <button
                      onClick={() => onEditLevel(index, level, level.id)}
                      disabled={loading}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Edit className="h-4 w-4 text-indigo-600" />
                    </button>
                    <button
                      onClick={() => onRemoveLevel(index, level.id)}
                      disabled={loading}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Unsaved levels (local state) */}
            {levels.map((level: LevelData, index: number) => {
              const isEditing = editingLevelIndex === index;
              const actualIndex = createdLevels.length + index;
              return (
                <div
                  key={`local-${index}`}
                  className={`flex flex-col gap-3 p-4 border rounded-lg border-dashed sm:flex-row sm:items-start sm:justify-between ${
                    isEditing ? "border-indigo-500 bg-indigo-50" : ""
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Level {actualIndex + 1}</Badge>
                      <h4 className="font-semibold">{level.name}</h4>
                      {level.isOptional && (
                        <Badge variant="outline">Optional</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        Not saved
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {level.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Duration: {level.durationWeeks} weeks
                    </p>
                    {level.learningOutcomes.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Outcomes: {level.learningOutcomes.length} items
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 sm:ml-4">
                    <button
                      onClick={() => onEditLevel(index, level)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Edit className="h-4 w-4 text-indigo-600" />
                    </button>
                    <button
                      onClick={() => onRemoveLevel(index)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>
                {editingLevelId || editingLevelIndex !== null
                  ? "Edit Level"
                  : "Add New Level"}
              </CardTitle>
              <CardDescription>
                Define the structure and progression of your program
              </CardDescription>
            </div>
            {(editingLevelId || editingLevelIndex !== null) && (
              <button
                onClick={onCancelEdit}
                className="inline-flex items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel Edit
              </button>
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
                onChange={(e) =>
                  setCurrentLevel({ ...currentLevel, name: e.target.value })
                }
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
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v > 0)
                    setCurrentLevel({ ...currentLevel, durationWeeks: v });
                }}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="levelDescription">Description</Label>
              <Textarea
                id="levelDescription"
                placeholder="Describe what this level covers..."
                rows={3}
                value={currentLevel.description}
                onChange={(e) =>
                  setCurrentLevel({
                    ...currentLevel,
                    description: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isOptional"
                  checked={currentLevel.isOptional}
                  onChange={(e) =>
                    setCurrentLevel({
                      ...currentLevel,
                      isOptional: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                <Label htmlFor="isOptional">This level is optional</Label>
              </div>
            </div>
          </div>

          {/* Level Learning Outcomes */}
          <div className="space-y-2">
            <Label>Learning Outcomes for this Level</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Add learning outcome"
                value={levelOutcomeInput}
                onChange={(e) => setLevelOutcomeInput(e.target.value)}
                onKeyPress={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addLevelOutcome())
                }
              />
              <button
                type="button"
                onClick={addLevelOutcome}
                className="inline-flex items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 p-2 rounded-lg transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1 mt-2">
              {currentLevel.learningOutcomes.map(
                (outcome: string, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted rounded"
                  >
                    <span className="text-sm">{outcome}</span>
                    <X
                      className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => removeLevelOutcome(outcome)}
                    />
                  </div>
                )
              )}
            </div>
          </div>

          {/* Level Prerequisites */}
          <div className="space-y-2">
            <Label>Prerequisites for this Level</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Add prerequisite"
                value={levelPrerequisiteInput}
                onChange={(e) => setLevelPrerequisiteInput(e.target.value)}
                onKeyPress={(e) =>
                  e.key === "Enter" &&
                  (e.preventDefault(), addLevelPrerequisite())
                }
              />
              <button
                type="button"
                onClick={addLevelPrerequisite}
                className="inline-flex items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 p-2 rounded-lg transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1 mt-2">
              {currentLevel.prerequisites.map(
                (prereq: string, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted rounded"
                  >
                    <span className="text-sm">{prereq}</span>
                    <X
                      className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => removeLevelPrerequisite(prereq)}
                    />
                  </div>
                )
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onAddLevel}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 w-full border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {editingLevelId || editingLevelIndex !== null
                  ? "Updating..."
                  : "Saving..."}
              </>
            ) : (
              <>
                {editingLevelId || editingLevelIndex !== null ? (
                  <>
                    <Check className="h-4 w-4" />
                    Update Level
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Level to Program
                  </>
                )}
              </>
            )}
          </button>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={loading || totalLevels === 0}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Next: Generate Roadmaps
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Component for Step 3 - Roadmap Generation
function RoadmapGeneration({
  levels,
  selectedLevel,
  roadmapInstructions,
  setRoadmapInstructions,
  onGenerate,
  onFinish,
  generatingRoadmap,
}: any) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge>Level {index + 1}</Badge>
                      <h4 className="font-semibold">{level.name}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {level.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Duration: {level.durationWeeks} weeks
                    </p>
                    {level.learningOutcomes &&
                      level.learningOutcomes.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium">
                            Learning Outcomes:
                          </p>
                          <ul className="text-xs text-muted-foreground list-disc list-inside">
                            {level.learningOutcomes
                              .slice(0, 3)
                              .map((outcome: string, i: number) => (
                                <li key={i}>{outcome}</li>
                              ))}
                            {level.learningOutcomes.length > 3 && (
                              <li>
                                +{level.learningOutcomes.length - 3} more...
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                  </div>
                  <div className="sm:ml-4">
                    <button
                      onClick={() => onGenerate(index)}
                      disabled={generatingRoadmap && selectedLevel === index}
                      className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
                    >
                      {generatingRoadmap && selectedLevel === index ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Generate Roadmap
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {selectedLevel === index && generatingRoadmap && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground animate-pulse">
                      AI is creating a detailed {level.durationWeeks}-week
                      roadmap with tasks, objectives, and milestones...
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">
              Additional Instructions (Optional)
            </Label>
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

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">
              💡 Tip: Roadmap Generation
            </h4>
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
        <button
          onClick={onFinish}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto"
        >
          <Check className="h-4 w-4" />
          Finish & View Program
        </button>
      </div>
    </div>
  );
}
