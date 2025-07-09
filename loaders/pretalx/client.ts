import type { AnswerReadable, RoomReadable, RoomsListData, SpeakerReadable, SpeakersListData, SubmissionReadable, SubmissionsListData, SubmissionTypeReadable, SubmissionTypesListData, TalkSlotReadable, TrackReadable, TracksListData } from './oapi'
import type { MultiLingualString, OptionalMultiLingualString, Room, Speaker, Submission, Track } from './types'
import { BadServerSideDataException } from './exception'
import { createClient } from './oapi/client'
import { coscupSessionQuestionIdMap } from './pretalx-types'
import { formatMultiLingualString, getAnswer } from './utils'

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export class PretalxApiClient {
  #client: ReturnType<typeof createClient>
  #year: number

  constructor(
    public readonly year: number,
    token: string | undefined = undefined,
  ) {
    this.#year = year
    this.#client = createClient({
      baseUrl: `https://pretalx.coscup.org`,
      headers: {
        ...(token ? { Authorization: `Token ${token}` } : undefined),
        'User-Agent': `coscup-website-client/${this.year}`,
        'Pretalx-Version': 'v1',
      },
    })
  }

  get event() {
    return `coscup-${this.#year}`
  }

  async #getPaginatedResources<T>(url: string): Promise<T[]> {
    const resources: T[] = []
    const baseUrl = this.#client.getConfig().baseUrl ?? ''
    let next = url

    while (true) {
      const response = await this.#client.get<PaginatedResponse<T>>({
        url: next,
      })
      if (!response.data) {
        throw new BadServerSideDataException(`No data found for this URL: ${next}`)
      }

      resources.push(...response.data.results)

      if (!response.data.next) {
        break
      }

      next = response.data.next.replace(baseUrl, '')
    }

    return resources
  }

  async getRooms(): Promise<Room[]> {
    const url = this.#client.buildUrl<RoomsListData>({
      url: '/api/events/{event}/rooms/',
      path: {
        event: this.event,
      },
      query: {
        limit: 100,
        offset: 0,
      },
    })

    const rooms = await this.#getPaginatedResources<RoomReadable>(url)

    return rooms.map((room) => {
      const name = formatMultiLingualString(room.name)
      if (!name) {
        throw new BadServerSideDataException(`Room ${room.id} has empty name.`)
      }

      return {
        id: room.id,
        name,
      } satisfies Room
    })
  }

  async getSpeakers(): Promise<Speaker[]> {
    const url = this.#client.buildUrl<SpeakersListData>({
      url: '/api/events/{event}/speakers/',
      path: {
        event: this.event,
      },
      query: {
        page_size: 25,
        page: 1,
      },
    })

    const speakers = await this.#getPaginatedResources<SpeakerReadable>(url)

    return speakers.map((speaker) => {
      return {
        code: speaker.code,
        avatar: speaker.avatar_url ??
          `https://avatar.iran.liara.run/username?username=${speaker.code}`,
        name: speaker.name,
        bio: speaker.biography ?? undefined,
      } satisfies Speaker
    })
  }

  async getTracks(): Promise<Track[]> {
    const url = this.#client.buildUrl<TracksListData>({
      url: '/api/events/{event}/tracks/',
      path: {
        event: this.event,
      },
      query: {
        page_size: 25,
        page: 1,
      },
    })

    const pretalxTracks = await this.#getPaginatedResources<TrackReadable>(url)

    return pretalxTracks.map((track) => ({
      id: track.id,
      name: formatMultiLingualString(track.name),
      description: track.description ? formatMultiLingualString(track.description) : undefined,
    } satisfies Track))
  }

  async getSubmissionsType(): Promise<Set<number>> {
    const url = this.#client.buildUrl<SubmissionTypesListData>({
      url: '/api/events/{event}/submission-types/',
      path: {
        event: this.event,
      },
      query: {
        page_size: 25,
        page: 1,
      },
    })

    const submissionsTypes = await this.#getPaginatedResources<SubmissionTypeReadable>(url)
    const submissionTypes = new Set<number>()

    for (const submissionType of submissionsTypes) {
      submissionTypes.add(submissionType.id)
    }

    return submissionTypes
  }

  async getSubmissionsOf(type: number): Promise<Submission[]> {
    const url = this.#client.buildUrl<SubmissionsListData>({
      url: '/api/events/{event}/submissions/',
      path: {
        event: this.event,
      },
      query: {
        state: ['accepted', 'confirmed'],
        expand: ['answers', 'slots'],
        page_size: 25,
        page: 1,
        submission_type: type,
      },
    })

    type ApiSubmissionResponse = Omit<SubmissionReadable, 'answers' | 'slots'> & {
      answers: AnswerReadable[]
      slots: TalkSlotReadable[]
    }
    const submissions = await this.#getPaginatedResources<ApiSubmissionResponse>(url)

    return submissions.map((submission) => {
      const enTitle = getAnswer(submission.answers, coscupSessionQuestionIdMap.EnTitle)
      const enDesc = getAnswer(submission.answers, coscupSessionQuestionIdMap.EnDesc)

      const start = submission.slots[0]?.start ? new Date(submission.slots[0].start) : undefined
      const end = submission.slots[0]?.end ? new Date(submission.slots[0].end) : undefined

      if (!submission.track) {
        throw new BadServerSideDataException(`Submission ${submission.code} has no track.`)
      }

      if (!submission.slots[0]?.room) {
        throw new BadServerSideDataException(`Submission ${submission.code} has no room.`)
      }

      if (!start || !end) {
        throw new BadServerSideDataException(`Submission ${submission.code} has no start or end.`)
      }

      return {
        code: submission.code,
        title: {
          'zh-tw': submission.title,
          'en': enTitle ?? submission.title,
        } satisfies MultiLingualString,
        description: {
          'zh-tw': submission.description ?? undefined,
          'en': enDesc ?? submission.description ?? undefined,
        } satisfies OptionalMultiLingualString,
        speakers: submission.speakers,
        track: submission.track,
        room: submission.slots[0]?.room,
        start: start.toISOString(),
        end: end.toISOString(),
      } satisfies Submission
    })
  }

  async getAllSubmissions(): Promise<Submission[]> {
    const submissionTypes = await this.getSubmissionsType()
    const submissions = await Promise.all(
      [...submissionTypes].map((type) => this.getSubmissionsOf(type)),
    )

    return submissions.flat()
  }
}
