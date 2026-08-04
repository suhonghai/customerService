import { ApiProperty } from '@nestjs/swagger';

export class ServiceHealthDto {
  @ApiProperty({ example: 'ok', description: 'ok | down | degraded' })
  status!: 'ok' | 'down' | 'degraded';

  @ApiProperty({ example: 5, description: 'latency in ms', required: false })
  latencyMs?: number;

  @ApiProperty({ example: 'connection refused', required: false })
  error?: string;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: 'overall status' })
  status!: string;

  @ApiProperty({ example: 12345, description: 'process uptime in seconds' })
  uptime!: number;

  @ApiProperty({ example: 1700000000000, description: 'unix ms' })
  timestamp!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/ServiceHealthDto' },
  })
  services!: {
    mysql: ServiceHealthDto;
  };
}
