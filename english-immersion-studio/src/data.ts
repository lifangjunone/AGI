import {
  BriefcaseBusiness,
  Coffee,
  Hotel,
  MessageCircleMore,
  Plane,
  Stethoscope
} from "lucide-react";

export type ScenarioId =
  | "interview"
  | "restaurant"
  | "hotel"
  | "small-talk"
  | "clinic"
  | "airport";

export type Scenario = {
  id: ScenarioId;
  title: string;
  subtitle: string;
  location: string;
  level: string;
  mood: string;
  icon: typeof BriefcaseBusiness;
  image: string;
  goals: string[];
  opening: string;
  openingChinese?: string;
  suggestions: string[];
  suggestionChinese?: string[];
};

export type Persona = {
  id: string;
  name: string;
  role: string;
  accent: string;
  trait: string;
  color: string;
  appearance: string;
};

export type Outfit = {
  id: string;
  name: string;
  note: string;
  prompt: string;
};

export type PerformanceState =
  | "inviting"
  | "listening"
  | "thinking"
  | "explaining"
  | "encouraging";

export const performances: Record<
  PerformanceState,
  { expression: string; gesture: string; label: string; cue: string }
> = {
  inviting: {
    expression: "warm half-smile with welcoming eyes",
    gesture: "relaxed shoulders, one open hand inviting the viewer to speak",
    label: "Warm eye contact",
    cue: "She is waiting for your answer"
  },
  listening: {
    expression: "focused eye contact, subtly raised eyebrows, attentive expression",
    gesture: "leaning slightly closer toward the viewer, hands relaxed",
    label: "Listening closely",
    cue: "Keep eye contact and finish your thought"
  },
  thinking: {
    expression: "thoughtful eyes and a subtle curious smile",
    gesture: "gentle head tilt, one hand resting lightly near the chin",
    label: "Thinking",
    cue: "She is considering what you said"
  },
  explaining: {
    expression: "expressive confident smile, animated eyes",
    gesture: "natural mid-conversation hand gesture toward the viewer",
    label: "Speaking to you",
    cue: "Listen for tone and sentence rhythm"
  },
  encouraging: {
    expression: "genuine bright smile, approving eyes",
    gesture: "small affirming nod with an open palm gesture",
    label: "Encouraging you",
    cue: "Good. Add one vivid detail next"
  }
};

export const scenarios: Scenario[] = [
  {
    id: "interview",
    title: "The Final Interview",
    subtitle: "Executive interview",
    location: "London · 09:30",
    level: "B2",
    mood: "Focused",
    icon: BriefcaseBusiness,
    image: `${import.meta.env.BASE_URL}scenes/interview.jpg`,
    goals: ["Introduce your impact", "Handle a difficult question", "Ask one smart question"],
    opening:
      "Good morning. I have been looking forward to meeting you. Shall we begin with the project you are most proud of?",
    suggestions: [
      "Thank you for having me.",
      "The project I am most proud of is...",
      "Before I answer, may I clarify the goal?"
    ]
  },
  {
    id: "restaurant",
    title: "Dinner in Manhattan",
    subtitle: "Restaurant conversation",
    location: "New York · 19:40",
    level: "A2",
    mood: "Warm",
    icon: Coffee,
    image: `${import.meta.env.BASE_URL}scenes/restaurant.jpg`,
    goals: ["Ask about the menu", "Order naturally", "Resolve one small issue"],
    opening:
      "Good evening, welcome. I will be taking care of you tonight. Would you like to hear our chef's recommendations?",
    suggestions: [
      "Yes, what do you recommend?",
      "Could I have a few more minutes?",
      "Does this dish contain any dairy?"
    ]
  },
  {
    id: "hotel",
    title: "The Grand Arrival",
    subtitle: "Hotel check-in",
    location: "Singapore · 16:10",
    level: "A2",
    mood: "Elegant",
    icon: Hotel,
    image: `${import.meta.env.BASE_URL}scenes/hotel.jpg`,
    goals: ["Confirm your booking", "Make a special request", "Understand hotel facilities"],
    opening:
      "Welcome to the Meridian. May I have the name on your reservation, please?",
    suggestions: [
      "The reservation is under Li.",
      "Could I request a quiet room?",
      "What time is breakfast served?"
    ]
  },
  {
    id: "small-talk",
    title: "Coffee & Small Talk",
    subtitle: "Everyday connection",
    location: "Melbourne · 14:20",
    level: "B1",
    mood: "Playful",
    icon: MessageCircleMore,
    image: `${import.meta.env.BASE_URL}scenes/small-talk.jpg`,
    goals: ["Start naturally", "Find common ground", "End the chat gracefully"],
    opening:
      "That looks like the best thing on the menu. Is this your first time here too?",
    suggestions: [
      "It is, actually. How about you?",
      "I almost ordered the same thing.",
      "Do you know this neighborhood well?"
    ]
  },
  {
    id: "clinic",
    title: "A Careful Consultation",
    subtitle: "Medical English",
    location: "Toronto · 11:15",
    level: "B1",
    mood: "Caring",
    icon: Stethoscope,
    image: `${import.meta.env.BASE_URL}scenes/clinic.jpg`,
    goals: ["Describe symptoms", "Answer follow-ups", "Confirm the treatment plan"],
    opening:
      "Hello, I am Dr. Claire Morgan. Take your time and tell me what has been troubling you.",
    suggestions: [
      "I have had a headache since yesterday.",
      "It gets worse in the evening.",
      "Could you explain the next steps?"
    ]
  },
  {
    id: "airport",
    title: "Above the Clouds",
    subtitle: "Cabin conversation",
    location: "Flight LY 208 · 21:05",
    level: "A2",
    mood: "Calm",
    icon: Plane,
    image: `${import.meta.env.BASE_URL}scenes/airport.jpg`,
    goals: ["Make a request", "Understand an announcement", "Handle a seat issue"],
    opening:
      "Good evening. We will be departing shortly. May I help you settle in before takeoff?",
    suggestions: [
      "Could I have a glass of water?",
      "Where can I put my jacket?",
      "Would it be possible to change seats?"
    ]
  }
];

export const personas: Persona[] = [
  {
    id: "sophia",
    name: "Sophia Laurent",
    role: "Executive Partner",
    accent: "British",
    trait: "Poised & perceptive",
    color: "#d7b476",
    appearance: "long dark brunette hair, sculpted cheekbones, hazel eyes, elegant hourglass figure"
  },
  {
    id: "ava",
    name: "Ava Chen",
    role: "Hospitality Director",
    accent: "American",
    trait: "Warm & expressive",
    color: "#e48672",
    appearance: "glossy long black hair, warm brown eyes, luminous skin, graceful feminine figure"
  },
  {
    id: "claire",
    name: "Claire Morgan",
    role: "Medical Consultant",
    accent: "Canadian",
    trait: "Calm & reassuring",
    color: "#77a99a",
    appearance: "soft auburn hair, green eyes, refined features, poised athletic feminine figure"
  },
  {
    id: "reina",
    name: "Reina Sato",
    role: "Creative Producer",
    accent: "Australian",
    trait: "Playful & curious",
    color: "#9b8bc5",
    appearance: "long raven hair, expressive dark eyes, delicate features, elegant feminine silhouette"
  }
];

export const outfits: Outfit[] = [
  { id: "executive", name: "Executive", note: "Sculpted tailoring", prompt: "a fitted charcoal skirt suit, ivory silk blouse with an elegant open neckline, sheer black tights and stiletto heels" },
  { id: "doctor", name: "Doctor", note: "Clinical allure", prompt: "a fitted white physician coat over a refined sage dress, sheer tights, stethoscope and elegant heels" },
  { id: "nurse", name: "Nurse", note: "Polished & feminine", prompt: "a tasteful fitted contemporary navy nurse dress, sheer tights and polished professional heels" },
  { id: "cabin", name: "Cabin Crew", note: "Aviation couture", prompt: "a tailored premium cabin crew skirt uniform, sculptural neck scarf, sheer tights and elegant heels" },
  { id: "hanfu", name: "Hanfu", note: "Romantic moonlight", prompt: "luxurious historically inspired Chinese hanfu in pale jade and pearl, flowing silk layers with an elegant neckline" },
  { id: "teacher", name: "Teacher", note: "Confident authority", prompt: "an adult language teacher in a fitted tweed jacket, pencil skirt, silk blouse, sheer tights and refined heels" },
  { id: "academy", name: "Academy 21+", note: "Adult campus style", prompt: "an adult university student age 21 or older in a tailored academy blazer, pleated skirt, opaque over-knee socks and loafers" },
  { id: "turtleneck", name: "Turtleneck", note: "Mature minimalism", prompt: "a fitted black turtleneck with an elegant high-waisted skirt and polished boots" },
  { id: "editorial", name: "Midnight Tights", note: "After-dark glamour", prompt: "a tasteful fitted black cocktail dress with a refined neckline, sheer black tights and high heels, sophisticated editorial glamour" },
  { id: "anime", name: "Neo Anime", note: "Playful cosplay", prompt: "a fitted high-fashion anime-inspired cosplay outfit in white red and graphite with over-knee stockings, realistic couture interpretation" }
];

export function createReply(input: string, scenario: Scenario, persona: Persona) {
  const text = input.toLowerCase();
  if (text.includes("recommend")) {
    return scenario.id === "restaurant"
      ? "The sea bass is beautifully light, and the mushroom risotto is richer. Which kind of evening are you in the mood for?"
      : "I recommend that you lead with the result, then explain the challenge and your decisions. What changed because of your work?";
  }
  if (text.includes("quiet room")) {
    return "Certainly. I have found a room away from the elevators on a higher floor. Would you prefer a city view or a garden view?";
  }
  if (text.includes("proud") || text.includes("project")) {
    return "That sounds significant. Give me one concrete example of a decision you personally made, and tell me how you measured its impact.";
  }
  if (text.includes("water") || text.includes("jacket")) {
    return "Of course. I can take care of that for you right away. Is there anything else that would make your journey more comfortable?";
  }
  if (text.includes("headache") || text.includes("pain")) {
    return "I understand. On a scale from one to ten, how strong is it, and have you noticed anything that makes it better or worse?";
  }
  if (/thank|thanks/.test(text)) {
    return `You are very welcome. I like how naturally you phrased that. Before we continue, what would you like to know about ${scenario.title.toLowerCase()}?`;
  }
  return `${persona.name.split(" ")[0]} smiles. “That is a clear start. Tell me a little more, and try adding one specific detail so I can picture the situation.”`;
}

export function scoreUtterance(input: string) {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const hasConnector = /\b(because|however|although|so|therefore|while)\b/i.test(input);
  const hasPoliteForm = /\b(could|would|may|please|thank)\b/i.test(input);
  return {
    fluency: Math.min(96, 66 + words.length * 2 + (hasConnector ? 7 : 0)),
    accuracy: Math.min(97, 72 + Math.min(words.length, 8) + (/[.!?]$/.test(input.trim()) ? 5 : 0)),
    expression: Math.min(98, 65 + words.length + (hasPoliteForm ? 12 : 0))
  };
}
