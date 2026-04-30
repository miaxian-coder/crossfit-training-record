# CrossFit Personal Training Record Web App Design

## Scope

Build a personal-use web app for recording CrossFit training days. The product is mobile-first and supports two image-driven entry points:

- OCR recognition of daily workout plans
- OCR recognition of workout results

The primary value is fast capture and later review, not fully automatic recognition. Every OCR result must pass through a confirmation step before persistence.

## Product Goal

The MVP should let one user complete this flow reliably:

1. Upload a screenshot of the day plan or a screenshot of the result
2. Receive a structured draft generated from OCR or multimodal parsing
3. Correct uncertain fields in under 30 seconds
4. Save the day record
5. Review history and basic trend summaries later

## Non-Goals

- Multi-user collaboration
- Social sharing or leaderboard
- Auto-generated training programming
- Wearables integration
- Full desktop-first analytics suite

## Core User Flows

### Flow A: Import Daily Workout Plan

1. User opens the app on mobile
2. User uploads a screenshot from chat, poster, or whiteboard
3. System classifies image as `plan`
4. System extracts raw text and generates a structured draft
5. User reviews date, workout type, blocks, movements, loads, time cap, and notes
6. User saves the plan into the current training day

### Flow B: Import Workout Result

1. User uploads a result screenshot
2. System classifies image as `result`
3. System extracts candidate fields such as time, rounds, reps, load, RX/scaled
4. User confirms or edits fields
5. User saves the result under the same training day

### Flow C: Manual Fallback

1. User taps `New Record`
2. User manually creates plan or result
3. App stores the entry without requiring OCR

### Flow D: Review History

1. User opens history
2. User filters by date, workout type, benchmark, or movement keyword
3. User opens a training day detail page
4. User edits saved plan or result if needed

## Information Architecture

The MVP should contain five screens:

### 1. Dashboard

- Quick upload entry
- Quick manual entry
- Recent training days
- This week summary

### 2. Import Screen

- Image picker or camera roll selection
- Upload state
- Auto classification result
- Retry option

### 3. OCR Confirmation Screen

- Original image preview
- Raw extracted text
- Structured editable form
- Confidence badges or highlight for low-confidence fields
- Save and cancel actions

### 4. Training Day Detail

- Date and title
- Plan blocks
- Result summary
- Source images
- Edit actions

### 5. History Screen

- Chronological list
- Filter chips
- Search by movement or note

## Data Model

The model should center on a training day rather than raw images.

### WorkoutDay

- `id`
- `workoutDate`
- `title`
- `status` (`draft`, `completed`)
- `createdAt`
- `updatedAt`

### WorkoutPlan

- `id`
- `workoutDayId`
- `sourceImageId`
- `rawText`
- `workoutType` (`strength`, `metcon`, `emom`, `amrap`, `for_time`, `skill`, `mixed`, `unknown`)
- `timeCapMinutes`
- `notes`
- `parserConfidence`
- `confirmedAt`

### WorkoutBlock

- `id`
- `workoutPlanId`
- `blockType` (`warmup`, `strength`, `skill`, `metcon`, `cooldown`, `other`)
- `title`
- `sequence`
- `description`
- `targetRounds`
- `targetReps`
- `targetLoadValue`
- `targetLoadUnit` (`kg`, `lb`, `bodyweight`, `unknown`)
- `durationSeconds`

### WorkoutResult

- `id`
- `workoutDayId`
- `sourceImageId`
- `rawText`
- `resultType` (`time`, `rounds_reps`, `load`, `max_effort`, `notes_only`, `mixed`)
- `finishTimeSeconds`
- `rounds`
- `reps`
- `loadValue`
- `loadUnit`
- `isRx`
- `rpe`
- `feeling`
- `notes`
- `parserConfidence`
- `confirmedAt`

### SourceImage

- `id`
- `workoutDayId`
- `imageType` (`plan`, `result`)
- `storageKey`
- `ocrStatus` (`pending`, `processed`, `failed`)
- `classificationConfidence`
- `createdAt`

## Parsing Strategy

The OCR pipeline should be intentionally staged.

### Step 1: Image Classification

Classify uploaded image as:

- `plan`
- `result`
- `unknown`

If confidence is low, default to `unknown` and ask the user to choose.

### Step 2: Text Extraction

Extract:

- Raw OCR text
- Candidate lines
- Approximate layout grouping

This output should always be stored for debugging and later parser iteration.

### Step 3: Structured Parsing

Use separate parsers for plan and result images.

#### Plan Parser

Target fields:

- Workout title
- Date
- Workout type
- Time cap
- Ordered blocks
- Movement names
- Rep schemes
- Loads and units
- Notes

#### Result Parser

Target fields:

- Finish time
- Rounds
- Reps
- Load and unit
- RX or scaled
- Notes

### Step 4: Validation Layer

Before showing data to the user:

- Normalize units
- Validate time format
- Prevent contradictory fields
- Detect duplicates for the same day
- Mark low-confidence fields

### Step 5: Human Confirmation

No OCR record is saved directly as final. The confirmation form is the quality gate.

## Recognition Rules

The parser should follow conservative rules.

- If a value is ambiguous, leave it blank
- Keep original text available beside structured fields
- Use a movement dictionary for common CrossFit terms, but never overwrite user intent silently
- Highlight uncertain fields rather than guessing

Examples:

- `12:43` can map to finish time with high confidence
- `95` without unit or label must stay ambiguous
- `FS` may suggest `front squat`, but only as a candidate

## Suggested Technical Stack

### Frontend

- `Next.js`
- `React`
- `Tailwind CSS`
- Form library only if confirmation form becomes complex

### Backend

- `Next.js API routes` for MVP
- Background queue only if OCR latency becomes a user issue

### Database

- `Postgres`

### Storage

- Object storage for uploaded images

### OCR and Parsing

- Multimodal model for image-to-JSON extraction
- Rule-based validation layer in application code

## API Design

### `POST /api/uploads`

Creates an upload record and returns a storage target or upload result.

### `POST /api/recognitions`

Input:

- `sourceImageId`
- optional forced `imageType`

Output:

- classified type
- raw text
- structured draft
- confidence metadata

### `POST /api/workout-days`

Creates a manual training day or saves a confirmed OCR draft.

### `PATCH /api/workout-days/:id`

Updates title, date, notes, or status.

### `GET /api/workout-days`

Returns paginated history with filters:

- date range
- workout type
- keyword

### `GET /api/workout-days/:id`

Returns complete day detail with plan, result, and source images.

### `PATCH /api/workout-plans/:id`

Updates confirmed plan data.

### `PATCH /api/workout-results/:id`

Updates confirmed result data.

## UX Details For Mobile

The confirmation screen is the highest-value screen and should be optimized first.

- Show image on top and form below on mobile
- Use large segmented controls for `RX/scaled`, units, and workout type
- Use dedicated inputs for time and load instead of free-form text where possible
- Collapse advanced notes under an expandable section
- Keep save action sticky at the bottom

## Basic Analytics In MVP

Keep analytics simple and directly derived from saved data.

- Training days per week
- Most common workout types
- Benchmark history
- Recent load PRs
- Recent time PRs

Do not attempt advanced readiness scoring or AI insights in the first release.

## Failure States

The app must support recovery without losing user trust.

### Upload Failure

- Show retry action
- Preserve selected image if possible

### OCR Failure

- Offer manual entry from the same image
- Store raw image for future retry if user permits

### Low Confidence Parse

- Show warning and require explicit review

### Duplicate Detection

- If same date and similar raw text already exist, ask whether to merge or create another record

## Security and Privacy

For a personal MVP, keep this lightweight but explicit.

- Require login if deployed publicly
- Limit image access to the owner only
- Avoid sending images to multiple providers unless needed
- Store original OCR text because it supports auditability

## Development Phases

### Phase 1: Foundation

- App shell
- Workout day schema
- Manual create and edit
- History list
- Detail page

Success criterion:

User can fully record training days without OCR.

### Phase 2: OCR Import

- Image upload
- Plan or result classification
- Draft generation
- Confirmation form
- Save confirmed drafts

Success criterion:

User can upload a screenshot and save a corrected record in under 30 seconds.

### Phase 3: Analytics

- Dashboard summary
- Basic PR views
- Benchmark filters

Success criterion:

User can review progress meaningfully without editing raw records.

### Phase 4: Quality Iteration

- Better prompts
- Better movement dictionary
- Better duplicate logic
- More parsing templates

Success criterion:

Reduced manual edits on real user screenshots.

## Open Decisions

These should be resolved before implementation starts:

1. Authentication strategy for a personal deployed app
2. OCR provider and cost boundary
3. Storage provider selection
4. Whether to support camera capture in addition to image upload in MVP
5. Whether benchmark movements need a dedicated taxonomy table in phase 1 or phase 3

## Recommended Build Order

1. Manual record CRUD
2. Training day detail and history
3. Image upload plumbing
4. OCR draft generation
5. Confirmation form
6. Dashboard metrics
7. Parser quality improvements
