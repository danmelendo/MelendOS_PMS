// ─────────────────────────────────────────────────────────────────────────────
// PMS connector — integration contract
//
// This interface IS the product story: the "Stays" mobile app integrates with a
// PMS only through these methods. Demo Stays ships a reference implementation
// (DemoStaysConnector) backed by its in-browser mock; integrating a different PMS
// means writing another `PmsConnector` and swapping the singleton in ./index.ts.
// Nothing in the mobile UI changes.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AvailabilityQuery,
  AvailabilityWatch,
  CommonSpace,
  Incident,
  IncidentCategory,
  Invoice,
  JournalEntry,
  JournalEventType,
  LoyaltyAccount,
  LoyaltyTransaction,
  Member,
  Prebooking,
  PmsProperty,
  PmsProvince,
  PmsRoom,
  PricePreview,
  PropertyBrand,
  Reservation,
  Reward,
  RoomOffer,
  SignatureDoc,
  SignatureDocType,
  SpaceBooking,
} from "./types";

export interface CreatePrebookingInput {
  memberId: string;
  propertyId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  /** true = hold without paying (prereserva); false = book straight away. */
  hold: boolean;
}

export interface CreateWatchInput {
  memberId: string;
  propertyId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface BookSpaceInput {
  memberId: string;
  spaceId: string;
  /** yyyy-MM-dd */
  date: string;
  startHour: number;
  endHour: number;
  guests: number;
}

export interface CreateIncidentInput {
  memberId: string;
  propertyName?: string | null;
  category: IncidentCategory;
  title: string;
  description: string;
}

export interface PmsConnector {
  /** Human-readable id of the PMS behind this connector (shown in the UI). */
  readonly pmsName: string;

  // ── Discovery ──
  listProvinces(filter?: { brand?: PropertyBrand }): Promise<PmsProvince[]>;
  listProperties(filter?: { provinceId?: string; brand?: PropertyBrand }): Promise<PmsProperty[]>;
  getProperty(id: string): Promise<PmsProperty | null>;
  listRooms(propertyId: string): Promise<PmsRoom[]>;

  // ── Availability ──
  searchAvailability(query: AvailabilityQuery): Promise<RoomOffer[]>;
  /** Occupancy-aware price preview for a property over the selected dates. */
  getPricePreview(query: AvailabilityQuery): Promise<PricePreview>;

  // ── Prebookings (prereservas) & reservations ──
  createPrebooking(input: CreatePrebookingInput): Promise<Prebooking>;
  getPrebooking(id: string): Promise<Prebooking | null>;
  confirmPrebooking(id: string): Promise<Reservation>;
  cancelPrebooking(id: string): Promise<void>;
  listBookings(memberId: string): Promise<Prebooking[]>;
  getBooking(id: string): Promise<Prebooking | null>;

  // ── Loyalty club ──
  getMember(memberId: string): Promise<Member | null>;
  getLoyaltyAccount(memberId: string): Promise<LoyaltyAccount>;
  listLoyaltyTransactions(memberId: string): Promise<LoyaltyTransaction[]>;
  listRewards(): Promise<Reward[]>;
  redeemReward(memberId: string, rewardId: string): Promise<LoyaltyAccount>;

  // ── Digital signature ──
  getSignature(reservationId: string): Promise<SignatureDoc | null>;
  submitSignature(
    reservationId: string,
    docType: SignatureDocType,
    signerName: string,
    signatureData: string,
  ): Promise<SignatureDoc>;

  // ── Availability watches (notify when a room frees up) ──
  createWatch(input: CreateWatchInput): Promise<AvailabilityWatch>;
  listWatches(memberId: string): Promise<AvailabilityWatch[]>;
  cancelWatch(id: string): Promise<void>;
  /**
   * Re-checks the member's active watches against current availability, marks any
   * whose room is now bookable as "available", and returns just those that became
   * available on this call (so the caller can fire a notification).
   */
  pollWatches(memberId: string): Promise<AvailabilityWatch[]>;

  // ── Common spaces (zonas comunes) ──
  listCommonSpaces(filter?: { propertyId?: string }): Promise<CommonSpace[]>;
  bookCommonSpace(input: BookSpaceInput): Promise<SpaceBooking>;
  listSpaceBookings(memberId: string): Promise<SpaceBooking[]>;
  cancelSpaceBooking(id: string): Promise<void>;

  // ── Invoices (facturas) ──
  listInvoices(memberId: string): Promise<Invoice[]>;

  // ── Incidents (incidencias) ──
  listIncidents(memberId: string): Promise<Incident[]>;
  createIncident(input: CreateIncidentInput): Promise<Incident>;

  // ── Booking journal ──
  listJournal(filter?: {
    bookingRef?: string;
    memberId?: string;
    propertyId?: string;
    eventType?: JournalEventType;
  }): Promise<JournalEntry[]>;
}
