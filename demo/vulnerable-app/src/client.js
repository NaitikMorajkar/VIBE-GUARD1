"use client";

const apiKey = "demo-client-api-key-1234567890";
const SUPABASE_SERVICE_ROLE_KEY = "demo-service-role-value-1234567890";
const createClient = (url) => ({ url, key: SUPABASE_SERVICE_ROLE_KEY });

export { apiKey, createClient };
