import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors"; // Import the cors middleware
import { ChatOpenAI } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { Document } from "langchain/document";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 30080;

// Middleware to handle JSON requests
app.use(express.json());
app.use(cors()); // Add this line to enable CORS for all routes

// Instantiate Model
const model = new ChatOpenAI({
  modelName: "gpt-3.5-turbo",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY, // Pass the API key from environment variables
});

// Fetch FAQ data
const fetchData = async () => {
  try {
    const response = await axios.get("http://localhost:1337/api/faqs");
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error.message);
    return [];
  }
};

const extractQuestionsAndAnswers = (data) => {
  return data.data.map((item) => {
    return {
      question: item.attributes.Question,
      answer: item.attributes.Answer[0].children[0].text,
    };
  });
};

// Populate Vector Store
const populateVectorStore = async () => {
  const data = await fetchData();
  const questionsAndAnswers = extractQuestionsAndAnswers(data);

  // Create documents from the FAQ data
  const docs = questionsAndAnswers.map(({ question, answer }) => {
    return new Document({ pageContent: `${question}\n${answer}`, metadata: { question } });
  });

  // Text Splitter
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 100, chunkOverlap: 20 });
  const splitDocs = await splitter.splitDocuments(docs);

  // Instantiate Embeddings function
  const embeddings = new OpenAIEmbeddings();

  // Create Vector Store
  const vectorstore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);
  return vectorstore;
};

// Logic to answer from Vector Store
const answerFromVectorStore = async (chatHistory, input) => {
  const vectorstore = await populateVectorStore();

  // Create a retriever from vector store
  const retriever = vectorstore.asRetriever({ k: 4 });

  // Create a HistoryAwareRetriever which will be responsible for
  // generating a search query based on both the user input and
  // the chat history
  const retrieverPrompt = ChatPromptTemplate.fromMessages([
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
    [
      "user",
      "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation",
    ],
  ]);

  // This chain will return a list of documents from the vector store
  const retrieverChain = await createHistoryAwareRetriever({
    llm: model,
    retriever,
    rephrasePrompt: retrieverPrompt,
  });

  // Define the prompt for the final chain
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a Strapi CMS FAQs assistant. Your knowledge is limited to the information I  provide in the context. 
       You will answer this question based solely on this information: {context}. Do not make up your own answer .
       If the answer is not present in the information, you will respond 'I don't have that information.
       If a question is outside the context of Strapi, you will respond 'I can only help with Strapi related questions.`,
    ],
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
  ]);
  
  // Since we need to pass the docs from the retriever, we will use
  // the createStuffDocumentsChain
  const chain = await createStuffDocumentsChain({
    llm: model,
    prompt: prompt,
  });

  // Create the conversation chain, which will combine the retrieverChain
  // and combineStuffChain in order to get an answer
  const conversationChain = await createRetrievalChain({
    combineDocsChain: chain,
    retriever: retrieverChain,
  });

  // Get the response
  const response = await conversationChain.invoke({
    chat_history: chatHistory,
    input: input,
  });

  // Log the response to the server console
  console.log("Server response:", response);
  return response;
};

// Route to handle incoming requests
app.post("/chat", async (req, res) => {
  const { chatHistory, input } = req.body;

  // Convert the chatHistory to an array of HumanMessage and AIMessage objects
  const formattedChatHistory = chatHistory.map((message) => {
    if (message.role === "user") {
      return new HumanMessage(message.content);
    } else {
      return new AIMessage(message.content);
    }
  });

  const response = await answerFromVectorStore(formattedChatHistory, input);
  res.json(response);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
