import ExifReader from "exifreader";

export interface ExifData {
  date?: string;
  gps?: string;
  lat?: number;
  lng?: number;
}

export async function extractExif(file: File): Promise<ExifData | null> {
  try {
    const buffer = await file.arrayBuffer();
    const tags = ExifReader.load(buffer, { expanded: true });

    const result: ExifData = {};

    // Date
    const dateTag =
      tags.exif?.DateTimeOriginal?.description ||
      tags.exif?.DateTime?.description;
    if (dateTag) result.date = dateTag;

    // GPS
    if (tags.gps?.Latitude && tags.gps?.Longitude) {
      result.lat = tags.gps.Latitude;
      result.lng = tags.gps.Longitude;
      result.gps = `${tags.gps.Latitude.toFixed(5)},${tags.gps.Longitude.toFixed(5)}`;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}
