import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DiagnosisResult } from '../components/diagnosis/DiagnosisResult';
import { DiagnosisChatAssistant } from '../components/chat/DiagnosisChatAssistant';
import { PredictionResponse, ChatAnswer } from '../types';
import * as client from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { useDiagnosis } from '../context/DiagnosisContext';

vi.mock('../context/DiagnosisContext', () => ({
  useDiagnosis: vi.fn(() => ({
    openAgronomist: vi.fn(),
  })),
}));

// Mock localStorage for test environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    sendChatMessage: vi.fn(),
    getChatSessions: vi.fn(),
    getChatSessionMessages: vi.fn(),
  };
});

describe('DiagnosisResult Visual States & AI Chat Handoff', () => {
  const healthyResult: PredictionResponse = {
    predicted_class: 'Potato___healthy',
    display_name: 'Potato — Healthy',
    confidence: 0.965,
    model_version: 'v1.0.0',
    precaution: 'Maintain regular irrigation and inspect weekly.',
  };

  const diseasedResult: PredictionResponse = {
    predicted_class: 'Potato___Early_blight',
    display_name: 'Potato — Early Blight',
    confidence: 0.88,
    model_version: 'v1.0.0',
    precaution: 'Apply certified copper fungicide.',
    probabilities: {
      'Potato___Early_blight': 0.88,
      'Potato___Late_blight': 0.12,
    },
  };

  const lowConfidenceResult: PredictionResponse = {
    predicted_class: 'Tomato___Early_blight',
    display_name: 'Tomato — Early Blight',
    confidence: 0.45,
    model_version: 'v1.0.0',
  };

  it('renders healthy badge for healthy plant diagnosis', () => {
    render(<DiagnosisResult result={healthyResult} onReset={vi.fn()} />);
    expect(screen.getByText(/health status: healthy plant/i)).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
  });

  it('renders pathology badge for diseased plant diagnosis', () => {
    render(<DiagnosisResult result={diseasedResult} onReset={vi.fn()} />);
    expect(screen.getByText(/health status: pathology detected/i)).toBeInTheDocument();
  });

  it('renders low confidence warning when confidence is below 60%', () => {
    render(<DiagnosisResult result={lowConfidenceResult} onReset={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/low diagnostic confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/consider capturing a sharper, well-lit photograph/i)).toBeInTheDocument();
  });

  it('calls openAgronomist when clicking Ask AI Assistant', () => {
    const openAgronomistMock = vi.fn();
    vi.mocked(useDiagnosis).mockReturnValue({ openAgronomist: openAgronomistMock } as any);

    render(<DiagnosisResult result={diseasedResult} onReset={vi.fn()} />);
    const askButton = screen.getByRole('button', { name: /ask ai assistant about this diagnosis/i });
    fireEvent.click(askButton);
    expect(openAgronomistMock).toHaveBeenCalled();
  });
});

describe('DiagnosisChatAssistant Component', () => {
  const testResult: PredictionResponse = {
    predicted_class: 'Tomato___Early_blight',
    display_name: 'Tomato — Early Blight',
    confidence: 0.92,
    model_version: 'v1.0.0',
    probabilities: {
      'Tomato___Early_blight': 0.92,
      'Tomato___healthy': 0.08,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial grounded greeting and quick prompts', () => {
    const onClose = vi.fn();
    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={onClose}
        result={testResult}
        cropType="Tomato"
      />
    );

    expect(screen.getByText(/agro ai agronomist/i)).toBeInTheDocument();
    expect(screen.getByText(/grounded ai/i)).toBeInTheDocument();
    expect(screen.getByText(/recommended treatments/i)).toBeInTheDocument();
    expect(screen.getByText(/preventative measures/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i)).toBeInTheDocument();
  });

  it('switches language between the supported Indian languages', () => {
    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const hindiBtn = screen.getByRole('button', { name: /switch language to hindi/i });
    fireEvent.click(hindiBtn);

    expect(screen.getByText(/नमस्ते! मैं आपका कृषि AI सहायक हूँ/i)).toBeInTheDocument();
    expect(screen.getByText(/उपचार और दवा/i)).toBeInTheDocument();

    const gujaratiBtn = screen.getByRole('button', { name: /switch language to gujarati/i });
    fireEvent.click(gujaratiBtn);

    expect(screen.getByText(/નમસ્તે! હું તમારો કૃષિ AI સહાયક છું/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /switch language to marathi/i }));
    expect(screen.getByText(/नमस्कार! मी तुमचा कृषी AI सहाय्यक आहे/i)).toBeInTheDocument();
    expect(screen.getByText(/उपचार आणि औषधे/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/या रोगाबद्दल प्रश्न विचारा/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /switch language to tamil/i }));
    expect(screen.getByText(/வணக்கம்! நான் உங்கள் வேளாண்மை AI உதவியாளர்/i)).toBeInTheDocument();
    expect(screen.getByText(/சிகிச்சை மற்றும் மருந்து/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /switch language to punjabi/i }));
    expect(screen.getByText(/ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡਾ ਖੇਤੀਬਾੜੀ AI ਸਹਾਇਕ ਹਾਂ/i)).toBeInTheDocument();
    expect(screen.getByText(/ਇਲਾਜ ਅਤੇ ਦਵਾਈ/i)).toBeInTheDocument();
  });

  it('successfully sends question and displays AI answer', async () => {
    const mockAnswer: ChatAnswer = {
      answer: 'Apply chlorothalonil or copper spray every 7-10 days.',
      session_id: '11111111-2222-3333-4444-555555555555',
      grounded: true,
      source: 'gemini',
      timestamp: new Date().toISOString(),
    };

    vi.mocked(client.sendChatMessage).mockResolvedValueOnce(mockAnswer);

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const input = screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i);
    const sendBtn = screen.getByRole('button', { name: /send message to agro ai/i });

    fireEvent.change(input, { target: { value: 'How often should I spray fungicide?' } });
    fireEvent.click(sendBtn);

    // User message is shown immediately
    expect(screen.getByText('How often should I spray fungicide?')).toBeInTheDocument();

    // Verify loading state
    expect(screen.getByText(/consulting agricultural knowledge base/i)).toBeInTheDocument();

    // Verify backend call was made with proper structure
    await waitFor(() => {
      expect(client.sendChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          predicted_class: 'Tomato___Early_blight',
          confidence: 0.92,
          question: 'How often should I spray fungicide?',
          language: 'en',
          session_id: expect.any(String),
        })
      );
    });

    // Assistant answer is displayed
    await waitFor(() => {
      expect(screen.getByText('Apply chlorothalonil or copper spray every 7-10 days.')).toBeInTheDocument();
    });
  });

  it('sends the selected chatbot language to the API', async () => {
    vi.mocked(client.sendChatMessage).mockResolvedValueOnce({
      answer: 'உங்கள் பயிரை தொடர்ந்து கண்காணிக்கவும்.',
      session_id: '11111111-2222-3333-4444-555555555555',
      grounded: true,
      source: 'gemini',
      timestamp: new Date().toISOString(),
    });

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /switch language to tamil/i }));
    fireEvent.change(screen.getByPlaceholderText(/இந்த நோயைப் பற்றி கேளுங்கள்/i), {
      target: { value: 'இந்த நோய்க்கு என்ன சிகிச்சை?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message to agro ai/i }));

    await waitFor(() => {
      expect(client.sendChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          question: 'இந்த நோய்க்கு என்ன சிகிச்சை?',
          language: 'ta',
        })
      );
    });
  });

  it('handles quick prompt button click directly', async () => {
    const mockAnswer: ChatAnswer = {
      answer: 'Remove lower infected leaves and avoid overhead watering.',
      session_id: '11111111-2222-3333-4444-555555555555',
      grounded: true,
      source: 'gemini',
      timestamp: new Date().toISOString(),
    };

    vi.mocked(client.sendChatMessage).mockResolvedValueOnce(mockAnswer);

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const promptBtn = screen.getByRole('button', { name: /preventative measures/i });
    fireEvent.click(promptBtn);

    await waitFor(() => {
      expect(client.sendChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          question: expect.stringContaining('preventative practices'),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Remove lower infected leaves and avoid overhead watering.')).toBeInTheDocument();
    });
  });

  it('displays retryable error message when API fails', async () => {
    vi.mocked(client.sendChatMessage).mockRejectedValueOnce(
      new Error('Agro AI Assistant is temporarily unavailable.')
    );

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const input = screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i);
    const sendBtn = screen.getByRole('button', { name: /send message to agro ai/i });

    fireEvent.change(input, { target: { value: 'What should I do?' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/agro ai assistant is temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('invokes onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={onClose}
        result={testResult}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /close ai chat assistant/i });
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reuses the same session_id across multiple questions in the same conversation', async () => {
    let capturedSessionIds: string[] = [];
    vi.mocked(client.sendChatMessage).mockImplementation(async (req) => {
      capturedSessionIds.push(req.session_id);
      return {
        answer: 'Response for: ' + req.question,
        session_id: req.session_id,
        grounded: true,
        source: 'gemini',
        timestamp: new Date().toISOString(),
      };
    });

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const input = screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i);
    const sendBtn = screen.getByRole('button', { name: /send message to agro ai/i });

    // Send first question
    fireEvent.change(input, { target: { value: 'First question' } });
    fireEvent.click(sendBtn);

    await waitFor(() => expect(screen.getByText('Response for: First question')).toBeInTheDocument());

    // Send second question
    fireEvent.change(input, { target: { value: 'Second question' } });
    fireEvent.click(sendBtn);

    await waitFor(() => expect(screen.getByText('Response for: Second question')).toBeInTheDocument());

    expect(capturedSessionIds.length).toBe(2);
    expect(capturedSessionIds[0]).toBe(capturedSessionIds[1]);
  });

  it('generates a new session_id when closing and reopening conversation', () => {
    let capturedSessionIds: string[] = [];
    vi.mocked(client.sendChatMessage).mockImplementation(async (req) => {
      capturedSessionIds.push(req.session_id);
      return {
        answer: 'Ok',
        session_id: req.session_id,
        grounded: true,
        source: 'gemini',
        timestamp: new Date().toISOString(),
      };
    });

    const { unmount } = render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const input = screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i);
    const sendBtn = screen.getByRole('button', { name: /send message to agro ai/i });
    fireEvent.change(input, { target: { value: 'Session A' } });
    fireEvent.click(sendBtn);

    unmount();

    // Reopen
    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const input2 = screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i);
    const sendBtn2 = screen.getByRole('button', { name: /send message to agro ai/i });
    fireEvent.change(input2, { target: { value: 'Session B' } });
    fireEvent.click(sendBtn2);

    expect(capturedSessionIds.length).toBe(2);
    expect(capturedSessionIds[0]).not.toBe(capturedSessionIds[1]);
  });

  it('includes leaf_detected and fallback_used in chat payload', async () => {
    const resultWithFlags: PredictionResponse = {
      ...testResult,
      leaf_detected: false,
      fallback_used: true,
    };

    vi.mocked(client.sendChatMessage).mockResolvedValueOnce({
      answer: 'Advice based on fallback model.',
      session_id: '123',
      grounded: true,
      source: 'gemini',
      timestamp: new Date().toISOString(),
    });

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={resultWithFlags}
      />
    );

    const input = screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i);
    const sendBtn = screen.getByRole('button', { name: /send message to agro ai/i });
    fireEvent.change(input, { target: { value: 'Is this leaf disease?' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(client.sendChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          leaf_detected: false,
          fallback_used: true,
        })
      );
    });
  });

  it('supports speech recognition when browser SpeechRecognition exists and inserts transcript into input', async () => {
    let onResultCallback: ((event: any) => void) | null = null;

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart: (() => void) | null = null;
      onresult: ((ev: any) => void) | null = null;
      onerror: ((ev: any) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        onResultCallback = this.onresult;
        if (this.onstart) this.onstart();
      }
      stop() {
        if (this.onend) this.onend();
      }
      abort() {}
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const micBtn = screen.getByRole('button', { name: /speak your question/i });
    expect(micBtn).toBeInTheDocument();

    fireEvent.click(micBtn);

    // Should toggle to listening state
    expect(screen.getByRole('button', { name: /stop voice recording/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/listening to your voice/i)).toBeInTheDocument();

    // Trigger recognized speech event
    const event = {
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: 'What is the best fertilizer?' }], { isFinal: true })
      ]
    };

    if (onResultCallback) {
      fireEvent(
        micBtn,
        new CustomEvent('speechresult', { detail: event })
      );
      // Directly invoke onresult callback
      (onResultCallback as any)(event);
    }

    // Speech text is inserted into input field
    await waitFor(() => {
      const input = screen.getByLabelText(/type your agricultural question/i) as HTMLInputElement;
      expect(input.value).toBe('What is the best fertilizer?');
    });

    delete (window as any).SpeechRecognition;
  });

  it('shows unsupported notification when speech recognition is unavailable in browser', () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );

    const micBtn = screen.getByRole('button', { name: /speak your question/i });
    fireEvent.click(micBtn);

    expect(screen.getByText(/speech recognition is not supported in this browser/i)).toBeInTheDocument();
  });

  it('hides history button for guest users', () => {
    render(
      <DiagnosisChatAssistant
        isOpen={true}
        onClose={vi.fn()}
        result={testResult}
      />
    );
    expect(screen.queryByRole('button', { name: /view chat history/i })).not.toBeInTheDocument();
  });

  it('shows history button for authenticated users', () => {
    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { email: 'farmer@example.com' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          resetToGuest: vi.fn(),
        }}
      >
        <DiagnosisChatAssistant
          isOpen={true}
          onClose={vi.fn()}
          result={testResult}
        />
      </AuthContext.Provider>
    );
    expect(screen.getByRole('button', { name: /view chat history/i })).toBeInTheDocument();
  });

  it('loads and renders sessions list when opening history', async () => {
    vi.mocked(client.getChatSessions).mockResolvedValueOnce([
      {
        id: 'session-uuid-1',
        created_at: '2026-09-13T10:00:00Z',
        updated_at: '2026-09-13T10:00:00Z',
      },
      {
        id: 'session-uuid-2',
        created_at: '2026-09-12T09:00:00Z',
        updated_at: '2026-09-12T09:00:00Z',
      },
    ]);

    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { email: 'farmer@example.com' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          resetToGuest: vi.fn(),
        }}
      >
        <DiagnosisChatAssistant
          isOpen={true}
          onClose={vi.fn()}
          result={testResult}
        />
      </AuthContext.Provider>
    );

    const historyBtn = screen.getByRole('button', { name: /view chat history/i });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(client.getChatSessions).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Session #2')).toBeInTheDocument();
      expect(screen.getByText('Session #1')).toBeInTheDocument();
    });
  });

  it('renders empty state when no sessions are returned', async () => {
    vi.mocked(client.getChatSessions).mockResolvedValueOnce([]);

    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { email: 'farmer@example.com' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          resetToGuest: vi.fn(),
        }}
      >
        <DiagnosisChatAssistant
          isOpen={true}
          onClose={vi.fn()}
          result={testResult}
        />
      </AuthContext.Provider>
    );

    const historyBtn = screen.getByRole('button', { name: /view chat history/i });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(screen.getByText(/no previous chat sessions found/i)).toBeInTheDocument();
    });
  });

  it('renders messages when a session is selected without sending new message', async () => {
    vi.mocked(client.getChatSessions).mockResolvedValueOnce([
      {
        id: 'session-uuid-1',
        created_at: '2026-09-13T10:00:00Z',
        updated_at: '2026-09-13T10:00:00Z',
      },
    ]);
    vi.mocked(client.getChatSessionMessages).mockResolvedValueOnce([
      {
        id: 101,
        role: 'user',
        content: 'Is this fungal blight?',
        created_at: '2026-09-13T10:00:00Z',
      },
      {
        id: 102,
        role: 'assistant',
        content: 'Yes, concentric rings indicate early blight.',
        created_at: '2026-09-13T10:00:02Z',
      },
    ]);

    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { email: 'farmer@example.com' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          resetToGuest: vi.fn(),
        }}
      >
        <DiagnosisChatAssistant
          isOpen={true}
          onClose={vi.fn()}
          result={testResult}
        />
      </AuthContext.Provider>
    );

    const historyBtn = screen.getByRole('button', { name: /view chat history/i });
    fireEvent.click(historyBtn);

    const sessionItem = await screen.findByText('Session #1');
    fireEvent.click(sessionItem);

    await waitFor(() => {
      expect(client.getChatSessionMessages).toHaveBeenCalledWith('session-uuid-1');
      expect(screen.getByText('Is this fungal blight?')).toBeInTheDocument();
      expect(screen.getByText('Yes, concentric rings indicate early blight.')).toBeInTheDocument();
      expect(client.sendChatMessage).not.toHaveBeenCalled();
    });
  });

  it('displays API error notice when sessions fetch fails', async () => {
    vi.mocked(client.getChatSessions).mockRejectedValueOnce(
      new Error('Failed to retrieve chat sessions.')
    );

    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { email: 'farmer@example.com' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          resetToGuest: vi.fn(),
        }}
      >
        <DiagnosisChatAssistant
          isOpen={true}
          onClose={vi.fn()}
          result={testResult}
        />
      </AuthContext.Provider>
    );

    const historyBtn = screen.getByRole('button', { name: /view chat history/i });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/failed to retrieve chat sessions/i)).toBeInTheDocument();
    });
  });

  it('returns to current conversation when Return to Current Chat is clicked', async () => {
    vi.mocked(client.getChatSessions).mockResolvedValueOnce([]);

    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { email: 'farmer@example.com' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          resetToGuest: vi.fn(),
        }}
      >
        <DiagnosisChatAssistant
          isOpen={true}
          onClose={vi.fn()}
          result={testResult}
        />
      </AuthContext.Provider>
    );

    const historyBtn = screen.getByRole('button', { name: /view chat history/i });
    fireEvent.click(historyBtn);

    expect(screen.getByRole('region', { name: /chat history viewer/i })).toBeInTheDocument();

    const returnBtn = screen.getByRole('button', { name: /return to current conversation/i });
    fireEvent.click(returnBtn);

    expect(screen.queryByRole('region', { name: /chat history viewer/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask about symptoms, treatments, or prevention/i)).toBeInTheDocument();
  });
});

describe('Prediction and Chat API Contract Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('predictDisease uses FormData with field "file"', async () => {
    let capturedFormData: FormData | null = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/predictions') {
        capturedFormData = init?.body as FormData;
        return {
          ok: true,
          json: async () => ({
            predicted_class: 'Tomato___Early_blight',
            confidence: 0.91,
            model_version: 'E11-SigLIP',
            display_name: 'Tomato Early Blight',
            pipeline: 'E11',
            leaf_detected: true,
            roi_count: 1,
            fallback_used: false,
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const actualClient = await vi.importActual<typeof import('../api/client')>('../api/client');
    const dummyFile = new File(['image-bytes'], 'leaf.jpg', { type: 'image/jpeg' });
    const response = await actualClient.predictDisease(dummyFile);

    expect(response.predicted_class).toBe('Tomato___Early_blight');
    expect(capturedFormData).not.toBeNull();
    expect((capturedFormData as unknown as FormData)?.get('image')).toBe(dummyFile);
  });

  it('sendChatMessage sends guest chat without Authorization header', async () => {
    let capturedHeaders: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/chat') {
        capturedHeaders = init?.headers;
        return {
          ok: true,
          json: async () => ({
            answer: 'Grounded advice',
            session_id: '123',
            grounded: true,
            source: 'gemini',
            timestamp: '2026-09-13T00:00:00Z',
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const actualClient = await vi.importActual<typeof import('../api/client')>('../api/client');
    await actualClient.sendChatMessage({
      predicted_class: 'Tomato___healthy',
      confidence: 0.98,
      probabilities: { 'Tomato___healthy': 0.98 },
      model_version: 'E11-SigLIP',
      question: 'How to water correctly?',
      session_id: 'a718d7f2-0199-4d66-a363-d14ef9fc5bc2',
      language: 'en',
    });

    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders['Authorization']).toBeUndefined();
  });

  it('sendChatMessage sends Bearer token when user is authenticated', async () => {
    localStorage.setItem('access_token', 'jwt_test_token_123');
    let capturedHeaders: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/chat') {
        capturedHeaders = init?.headers;
        return {
          ok: true,
          json: async () => ({
            answer: 'Authenticated grounded advice',
            session_id: '123',
            grounded: true,
            source: 'gemini',
            timestamp: '2026-09-13T00:00:00Z',
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const actualClient = await vi.importActual<typeof import('../api/client')>('../api/client');
    await actualClient.sendChatMessage({
      predicted_class: 'Tomato___healthy',
      confidence: 0.98,
      probabilities: { 'Tomato___healthy': 0.98 },
      model_version: 'E11-SigLIP',
      question: 'How to fertilize correctly?',
      session_id: 'a718d7f2-0199-4d66-a363-d14ef9fc5bc2',
      language: 'en',
    });

    expect(capturedHeaders['Authorization']).toBe('Bearer jwt_test_token_123');
  });

  it('sendChatMessage rejects questions exceeding 500 characters', async () => {
    const actualClient = await vi.importActual<typeof import('../api/client')>('../api/client');
    await expect(
      actualClient.sendChatMessage({
        predicted_class: 'Tomato___healthy',
        confidence: 0.98,
        probabilities: { 'Tomato___healthy': 0.98 },
        model_version: 'E11-SigLIP',
        question: 'a'.repeat(501),
        session_id: 'a718d7f2-0199-4d66-a363-d14ef9fc5bc2',
        language: 'en',
      })
    ).rejects.toThrow(/between 1 and 500 characters/i);
  });

  it('getChatSessions forwards Bearer token and returns session list', async () => {
    localStorage.setItem('access_token', 'jwt_test_token_123');
    let capturedUrl = '';
    let capturedHeaders: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      return {
        ok: true,
        json: async () => [
          {
            id: 'a718d7f2-0199-4d66-a363-d14ef9fc5bc2',
            created_at: '2026-09-13T00:00:00Z',
            updated_at: '2026-09-13T00:00:00Z',
          },
        ],
      };
    }) as any;

    const actualClient = await vi.importActual<typeof import('../api/client')>('../api/client');
    const sessions = await actualClient.getChatSessions();

    expect(capturedUrl).toBe('/api/chat/sessions');
    expect(capturedHeaders['Authorization']).toBe('Bearer jwt_test_token_123');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('a718d7f2-0199-4d66-a363-d14ef9fc5bc2');
  });

  it('getChatSessionMessages safely encodes session_id and forwards Bearer token', async () => {
    localStorage.setItem('access_token', 'jwt_test_token_123');
    let capturedUrl = '';
    let capturedHeaders: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      return {
        ok: true,
        json: async () => [
          {
            id: 1,
            role: 'user',
            content: 'How can I treat this?',
            created_at: '2026-09-13T00:00:00Z',
          },
          {
            id: 2,
            role: 'assistant',
            content: 'Apply organic copper spray.',
            created_at: '2026-09-13T00:00:01Z',
          },
        ],
      };
    }) as any;

    const actualClient = await vi.importActual<typeof import('../api/client')>('../api/client');
    const messages = await actualClient.getChatSessionMessages('uuid-123/special?');

    expect(capturedUrl).toBe('/api/chat/sessions/uuid-123%2Fspecial%3F/messages');
    expect(capturedHeaders['Authorization']).toBe('Bearer jwt_test_token_123');
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('How can I treat this?');
    expect(messages[1].role).toBe('assistant');
  });
});
