# Dashboard

Dashboard is the homepage of the admin panel, displaying real-time system core data and operational status.

## Page Overview

Dashboard consists of two main areas:

1. **Key Metrics Cards** - 6 core business indicators
2. **Statistics Charts** - Revenue, user, and traffic statistics

## Key Metrics Cards

Top section displays 6 key business metric cards:

### Online Users
- **Display**: Current number of online users
- **Subtitle**: "Currently Online"
- **Click Action**: Jump to `/dashboard/user` user management page
- **Icon**: Blue user icon

### Today's Traffic
- **Display**: Today's total upload + download traffic
- **Subtitle**: Shows upload/download traffic breakdown
  - ↑ Upload traffic
  - ↓ Download traffic
- **Icon**: Purple exchange icon
- **Format**: Auto-converts to appropriate units (KB/MB/GB/TB)

### Monthly Traffic
- **Display**: This month's total upload + download traffic
- **Subtitle**: Shows monthly upload/download traffic breakdown
- **Icon**: Orange cloud data icon
- **Format**: Auto-converts to appropriate units

### Total Servers
- **Display**: Online servers + Offline servers
- **Subtitle**: Shows online/offline server count breakdown
  - "Online X Offline Y"
- **Click Action**: Jump to `/dashboard/servers` server management page
- **Icon**: Green server icon

### Pending Tickets
- **Display**: Number of tickets awaiting admin reply
- **Subtitle**: "Pending"
- **Click Action**: Jump to `/dashboard/ticket` ticket management page
- **Icon**: Red ticket icon

### System Version Info
- **Display**:
  - Backend service version number
  - Web admin version number
  - Version update status
- **Operations**:
  - Check for updates
  - One-click update (if new version available)
  - Restart system
  - View update logs

::: tip Tip
Click cards with links to quickly jump to the corresponding management page.
:::

## Statistics Charts

### Revenue Statistics Chart

Displays system revenue data with three time dimensions:

**Time Dimensions**:
- **Today**: Today's revenue data
- **Month**: Daily revenue trend for this month
- **Total**: Historical cumulative revenue data

**Today's Data** - Pie Chart:
- **New Purchase**: Revenue from new user orders
- **Renewal**: Revenue from renewal orders
- **Center Number**: Today's total revenue

**Month Data** - Bar Chart:
- X-axis: Daily dates
- Y-axis: Revenue amount
- Shows daily revenue bars for the month
- Hover to view detailed data

**Total Data** - Area Chart:
- **New Purchase Orders**: Cumulative new purchase order count
- **Renewal Orders**: Cumulative renewal order count
- **Total Orders**: Total cumulative orders
- Area chart showing long-term trends

**Bottom Summary**:
- New purchase amount / order count
- Renewal amount / order count
- Total amount / total order count

### User Statistics Chart

Displays user-related data with three time dimensions:

**Time Dimensions**:
- **Today**: Today's user data
- **Month**: Daily user trend for this month
- **Total**: Historical cumulative user data

**Today's Data** - Pie Chart:
- **Register**: Today's new registered users
- **New Purchase**: Today's first-time buyers
- **Repurchase**: Today's renewal users
- **Center Number**: Today's total users (register + new purchase + repurchase)

**Month Data** - Bar Chart:
- X-axis: Daily dates
- Y-axis: User count
- Three colored bars:
  - Registered users (blue)
  - New purchase users (green)
  - Renewal users (orange)

**Total Data** - Area Chart:
- **Registered Users**: Cumulative registration trend
- **New Purchase Users**: Cumulative new purchase trend
- **Renewal Users**: Cumulative renewal trend
- Three area curves showing long-term changes

**Bottom Summary**:
- Total registered users
- Total new purchase users
- Total renewal users

### Traffic Ranking Chart

Displays node or user traffic usage ranking:

**Time Toggle** (top-right tabs):
- **Today**: Today's traffic ranking
- **Yesterday**: Yesterday's traffic ranking

**Type Selection** (dropdown):
- **Node Traffic (Nodes)**: Shows server node traffic consumption ranking
- **User Traffic (Users)**: Shows user traffic usage ranking

**Chart Display** - Horizontal Bar Chart:
- Y-axis: Ranking number (1, 2, 3...)
- X-axis: Traffic size (auto-converts units)
- Bars: Traffic size visualization
- Bar Labels: Shows node name or user ID

**Interactions**:
- Hover: Display detailed traffic data
- Node Mode: Shows node name and traffic
- User Mode: Shows user subscription details (ID, package, expiry, etc.)

**Empty State**:
- Shows empty state message when no data

::: tip Traffic Calculation
Traffic = Upload traffic + Download traffic, automatically converted to KB/MB/GB/TB units.
:::

## Data Refresh

- **Auto Refresh**: Page data updates automatically based on query configuration
- **Manual Refresh**: Refresh browser to immediately update all data
- **Real-time**: Key metrics fetch latest data in real-time

## Usage Recommendations

1. **Daily Review**: Check Dashboard daily to understand operational status
2. **Monitor Metrics**: Focus on real-time indicators like online users and pending tickets
3. **Trend Analysis**: Regularly review chart trends to analyze business changes
4. **Handle Anomalies**: Click cards to jump and handle issues when detecting data anomalies
5. **Version Updates**: Update system promptly when new version is available

## Troubleshooting

### Inaccurate Data?

1. Refresh browser page to re-fetch data
2. Check if server time is correct
3. Review system logs for errors

### Chart Showing Empty?

Possible causes:
- No data in the time period
- Data statistics service issue
- Try refreshing the page

## Next Steps

- [User Management](/admin/users-support/users) - View user details and traffic usage
- [Ticket Management](/admin/users-support/tickets) - Handle pending tickets
- [Server Management](/admin/maintenance/servers) - Manage server nodes
- [Order Management](/admin/commerce/orders) - View revenue and order details
