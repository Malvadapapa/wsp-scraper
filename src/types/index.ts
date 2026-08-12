export interface LinkedInRecord {
  timestamp: string;          // Columna A: Fecha y hora
  senderIdentifier: string;   // Columna B: Número de teléfono (o nombre/@usuario si no hay número)
  whatsappName: string;       // Columna C: Nombre de WhatsApp (pushName)
  linkedinUrl: string;        // Columna D: Enlace a LinkedIn
  fullText: string;           // Columna E: Mensaje completo
}

export interface QueueItem {
  id: string;                 // Identificador único (UUID o timestamp)
  record: LinkedInRecord;     // Registro a subir
  status: 'pending' | 'processed' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: string;
}

